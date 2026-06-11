import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { parse } from "cookie";

export const config = { maxDuration: 60 };

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

// SAFE: nettoie les caractères qui cassent JSON/prompt
function safeStr(str) {
  if (!str) return "";
  return String(str)
  .replace(/\\/g, "\\\\")
  .replace(/"/g, '\\"')
  .replace(/\n/g, " ")
  .replace(/\r/g, " ")
  .trim();
}

async function ensureUserStructure(db, userId) {
  if (!userId) return;
  const userRef = db.collection("users").doc(userId);
  const convRef = db.collection("conversations").doc(userId);
  await Promise.all([
    userRef.set({ createdAt: Date.now() }, { merge: true }),
    convRef.set({ conversations: [] }, { merge: true })
  ]);
}

async function cleanupOldData(db, userId) {
  const limit = 5 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const msgSnap = await db.collection("users").doc(userId).collection("messages").where("timestamp", "<", now - limit).get();
  const msgBatch = db.batch();
  msgSnap.forEach((doc) => msgBatch.delete(doc.ref));
  await msgBatch.commit();

  const convRef = db.collection("conversations").doc(userId);
  const convSnap = await convRef.get();
  if (convSnap.exists) {
    const conversations = convSnap.data().conversations || [];
    const filtered = conversations.filter(c => {
      const lastUpdate = c.updatedAt || c.date || 0;
      return now - lastUpdate <= limit;
    });
    if (filtered.length!== conversations.length) {
      await convRef.set({ conversations: filtered });
    }
  }
}

// FIX CRITIQUE: On démarre SSE AVANT tout traitement qui peut crash
export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method!== "POST") return res.status(405).json({ error: "Method not allowed" });

  // 1. SSE HEADERS IMMÉDIATEMENT - avant tout crash possible
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: pas de buffer

  const sendError = (msg) => {
    try {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch {}
  };

  try {
    // 2. AUTH
    const cookies = parse(req.headers.cookie || "");
    const session = cookies.aurx_session;
    let userId = "guest_global";
    if (session) {
      try {
        const user = JSON.parse(Buffer.from(session, "base64").toString());
        userId = user.sid || user.id || "guest_global";
      } catch {}
    }

    // 3. BODY
    let body = {};
    try {
      body = typeof req.body === "string"? JSON.parse(req.body) : req.body || {};
    } catch {
      return sendError("Invalid JSON body");
    }

    const message = body.message?.trim();
    const convId = body.convId;

    if (!message) return sendError("Missing message");
    if (!convId) return sendError("Missing convId");

    const now = Date.now();
    await ensureUserStructure(db, userId);

    // 4. MEMORY SAVE - extracteur minimal: nom + prefs + lieu/age/job uniquement
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length > 0) {
        await saveMemory(db, userId, memories);
      }
    } catch (e) {
      console.error("Memory save error:", e);
    }

    // 5. HISTORY
    let history = [];
    try {
      const snap = await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .where("convId", "==", convId)
      .orderBy("timestamp", "desc")
      .limit(20)
      .get();

      const docs = snap.docs.reverse();
      docs.forEach(d => {
        const data = d.data();
        history.push({ role: data.role, content: data.text });
      });
      console.log(`[HISTORY] ${userId} | ${convId} | ${history.length} msgs`);
    } catch (e) {
      console.error("History load error:", e);
    }

    history.push({ role: "user", content: message });

    // 6. MEMORY LOAD - LECTURE FIRESTORE UNIQUEMENT
    let userName = null;
    let prefs = [];
    let facts = [];

    try {
      const memSnap = await db.collection("users").doc(userId).collection("memory").limit(30).get();
      memSnap.forEach(doc => {
        const d = doc.data();
        if (d.type === "identity" && d.key === "name") userName = d.value;
        else if (d.type === "preference") prefs.push(d.value);
        else if (d.type === "fact") facts.push(d.value);
      });
      console.log(`[MEMORY] User: ${userName || 'Unknown'} | Prefs: ${prefs.length} | Facts: ${facts.length}`);
    } catch (e) {
      console.error("Memory load error:", e);
    }

    // 7. SAVE USER MSG
    const userMsgData = {
      role: "user",
      type: "user",
      text: message,
      content: message,
      timestamp: now,
      convId
    };
    await db.collection("users").doc(userId).collection("messages").add(userMsgData);

    // 8. PROMPT - INJECTION SAFE DEPUIS FIRESTORE
    const basePrompt = buildPrompt();
    let memoryCtx = "";

    if (userName) {
      const safeName = safeStr(userName);
      memoryCtx += `USER_NAME: ${safeName}\n`;
      memoryCtx += `RULE: If user asks "comment je m'appelle", "quel est mon nom", reply exactly: Tu t'appelles ${safeName}\n\n`;
    }
    if (prefs.length) {
      memoryCtx += `User likes: ${prefs.map(safeStr).slice(0, 3).join(", ")}.\n\n`;
    }
    if (facts.length) {
      memoryCtx += `Facts: ${facts.map(safeStr).slice(0, 3).join(", ")}.\n\n`;
    }

    const systemPrompt = memoryCtx? `${memoryCtx}---\n\n${basePrompt}` : basePrompt;
    const messages = [{ role: "system", content: systemPrompt },...history];

    console.log("[GPT] Streaming", messages.length, "messages");

    // 9. OPENROUTER STREAM
    const apiKey = process.env.OPENAI_API_KEY_1;
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://aurx.vercel.app",
        "X-Title": "AurX"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages,
        stream: true,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[OpenRouter]", response.status, err);
      return sendError("AI service error");
    }

    // 10. STREAM TO CLIENT
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullReply = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullReply += content;
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch {}
        }
      }
    } catch (e) {
      console.error('Stream error:', e);
      res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
    }

    // 11. SAVE BOT MSG
    const botMsgData = {
      role: "assistant",
      type: "bot",
      text: fullReply || "",
      content: fullReply || "",
      timestamp: Date.now(),
      convId,
    };

    try {
      await db.collection("users").doc(userId).collection("messages").add(botMsgData);

      const convRef = db.collection("conversations").doc(userId);
      await db.runTransaction(async (t) => {
        const convSnap = await t.get(convRef);
        let conversations = convSnap.exists? convSnap.data().conversations || [] : [];
        let currentConv = conversations.find(c => c.id === convId);
        if (!currentConv) {
          currentConv = { id: convId, title: message.slice(0, 40), messages: [], date: now, updatedAt: now };
          conversations.unshift(currentConv);
        }
        currentConv.messages.push(userMsgData, botMsgData);
        currentConv.updatedAt = Date.now();
        if (conversations.length > 30) conversations = conversations.slice(0, 30);
        t.set(convRef, { conversations });
      });
    } catch (dbErr) {
      console.error("DB save error:", dbErr);
    }

    // 12. FIN SSE
    res.write(`data: [DONE]\n\n`);
    res.end();

    cleanupOldData(db, userId).catch(e => console.error("Cleanup error:", e));

  } catch (err) {
    console.error("Server crash:", err);
    sendError("Server error");
  }
}
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

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method!== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // 1. SSE HEADERS IMMÉDIATEMENT
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendError = (msg) => {
    try {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch {}
  };

  try {
    // 2. USER
    const cookies = parse(req.headers.cookie || "");
    let userId = "guest_global";

    if (cookies.aurx_session) {
      try {
        const user = JSON.parse(
          Buffer.from(cookies.aurx_session, "base64").toString()
        );
        userId = user.sid || user.id || "guest_global";
      } catch {}
    }

    const body =
      typeof req.body === "string"? JSON.parse(req.body) : req.body || {};

    const message = body.message?.trim();
    const convId = body.convId;

    if (!message ||!convId) {
      return sendError("Missing fields");
    }

    const now = Date.now();
    await ensureUserStructure(db, userId);

    // 3. MEMORY SAVE
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length) {
        await saveMemory(db, userId, memories);
      }
    } catch (e) {
      console.error("Memory save error:", e);
    }

    // 4. HISTORY
    const snap = await db
   .collection("users")
   .doc(userId)
   .collection("messages")
   .where("convId", "==", convId)
   .orderBy("timestamp", "desc")
   .limit(20)
   .get();

    let history = snap.docs
   .map((d) => d.data())
   .reverse()
   .map((d) => ({
      role: d.role,
      content: d.text,
    }));

    history.push({ role: "user", content: message });

    // 5. MEMORY LOAD - FIRESTORE UNIQUEMENT
    let userName = null;
    let prefs = [];
    let facts = [];

    try {
      const memSnap = await db
     .collection("users")
     .doc(userId)
     .collection("memory")
     .limit(30)
     .get();

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

    // 6. SAVE USER MESSAGE
    await db.collection("users").doc(userId).collection("messages").add({
      role: "user",
      text: message,
      timestamp: now,
      convId,
    });

    // 7. PROMPT - INJECTION SAFE
    const basePrompt = buildPrompt();
    let memoryCtx = "";

    if (userName) {
      const safeName = safeStr(userName);
      memoryCtx += `USER_NAME: ${safeName}\n`;
      memoryCtx += `RULE: If user asks "comment je m'appelle", "quel est mon nom", "mon nom", reply exactly: Tu t'appelles ${safeName}\n\n`;
    }
    if (prefs.length) {
      memoryCtx += `User likes: ${prefs.map(safeStr).slice(0, 3).join(", ")}.\n\n`;
    }
    if (facts.length) {
      memoryCtx += `Facts: ${facts.map(safeStr).slice(0, 3).join(", ")}.\n\n`;
    }

    const systemPrompt = memoryCtx? `${memoryCtx}---\n\n${basePrompt}` : basePrompt;

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
   ...history,
    ];

    console.log("[GPT] Streaming", messages.length, "messages");
    console.log("[SYSTEM PROMPT]", systemPrompt.substring(0, 200));

    // 8. OPENROUTER STREAM
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY_1}`,
          "HTTP-Referer": "https://aurx.vercel.app",
          "X-Title": "AurX",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages,
          stream: true,
          temperature: 0.7,
        }),
      }
    );

    if (!response.ok ||!response.body) {
      const err = await response.text();
      console.error("OpenRouter error:", response.status, err);
      return sendError("AI service error");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullReply = '';
    let buffer = '';

    // 9. STREAM LOOP - FIX: continue au lieu de break
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() ||!line.startsWith('data: ')) continue;
          
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue; // FIX: continue au lieu de break

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            
            if (content) {
              fullReply += content;
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
              if (res.flush) res.flush();
            }
          } catch (e) {
            console.error("Parse error:", e);
          }
        }
      }
    } catch (e) {
      console.error('Stream error:', e);
      res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
    }

    // 10. SAVE BOT MESSAGE
    const replyTime = Date.now();

    try {
      await db.collection("users").doc(userId).collection("messages").add({
        role: "assistant",
        text: fullReply || "",
        timestamp: replyTime,
        convId,
      });

      const convRef = db.collection("conversations").doc(userId);
      await db.runTransaction(async (t) => {
        const convSnap = await t.get(convRef);
        let conversations = convSnap.exists? convSnap.data().conversations || [] : [];
        let currentConv = conversations.find(c => c.id === convId);

        if (!currentConv) {
          currentConv = {
            id: convId,
            title: message.slice(0, 40),
            messages: [],
            date: now,
            updatedAt: now
          };
          conversations.unshift(currentConv);
        }

        currentConv.messages.push(
          { text: message, type: "user", timestamp: now },
          { text: fullReply || "", type: "bot", timestamp: replyTime }
        );
        currentConv.updatedAt = replyTime;

        if (conversations.length > 30) conversations = conversations.slice(0, 30);
        t.set(convRef, { conversations });
      });
    } catch (dbErr) {
      console.error("DB save error:", dbErr);
    }

    // 11. END SSE
    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (err) {
    console.error("Server crash:", err);
    sendError("Server error");
  }
}
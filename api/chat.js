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

async function ensureUserStructure(db, userId) {
  if (!userId) return;
  const userRef = db.collection("users").doc(userId);
  const convRef = db.collection("conversations").doc(userId);
  await userRef.set({ createdAt: Date.now() }, { merge: true });
  await convRef.set({ conversations: [] }, { merge: true });
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

export default async function handler(req, res) {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method!== "POST") return res.status(405).json({ error: "Method not allowed" });

    const cookies = parse(req.headers.cookie || "");
    const session = cookies.aurx_session;
    let userId = "guest_global";
    if (session) {
      try {
        const user = JSON.parse(Buffer.from(session, "base64").toString());
        userId = user.sid || user.id || "guest_global";
      } catch {}
    }

    let body = {};
    try {
      body = typeof req.body === "string"? JSON.parse(req.body) : req.body || {};
    } catch {}
    const message = body.message?.trim();
    const convId = body.convId;

    if (!message) return res.status(400).json({ error: "Missing message" });
    if (!convId) return res.status(400).json({ error: "Missing convId" });

    const now = Date.now();
    await ensureUserStructure(db, userId);

    // MEMORY SAVE
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length > 0) {
        await saveMemory(db, userId, memories);
        console.log("[MEMORY SAVE] Saved:", memories.length, "items");
      }
    } catch (e) {
      console.error("Memory save error:", e);
    }

    // HISTORY
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
        history.push({
          role: data.role,
          content: data.text
        });
      });

      console.log(`[HISTORY] UserId: ${userId} | ConvId: ${convId} | Loaded ${history.length} messages`);
    } catch (e) {
      console.error("History load error:", e);
    }

    history.push({ role: "user", content: message });

    // MEMORY LOAD - DEBUG COMPLET
    let userMemory = {
      name: null,
      identity: [],
      facts: [],
      preferences: []
    };
    try {
      console.log("[DEBUG] Starting memory load for userId:", userId);
      const memSnap = await db.collection("users").doc(userId).collection("memory").get();
      console.log("[DEBUG] Memory docs found:", memSnap.size);

      memSnap.forEach(doc => {
        const d = doc.data();
        console.log("[DEBUG] Memory doc:", d);
        if (d.type === "identity" && d.key === "name") userMemory.name = d.value;
        if (d.type === "identity") userMemory.identity.push(d.value);
        else if (d.type === "preference") userMemory.preferences.push(d.value);
        else userMemory.facts.push(d.value);
      });

      console.log(`[MEMORY] Final:`, JSON.stringify(userMemory));
    } catch (e) {
      console.error("[MEMORY LOAD ERROR]:", e);
    }

    // STRUCTURE UNIFIÉE USER MSG
    const userMsgData = {
      role: "user",
      type: "user",
      text: message,
      content: message,
      timestamp: now,
      convId
    };

    // SAVE USER MSG
    await db.collection("users").doc(userId).collection("messages").add(userMsgData);

    // PROMPT - INJECTION DIRECTE + FONCTION TEST
    const basePrompt = buildPrompt();
    console.log("[DEBUG] Base prompt length:", basePrompt.length);

    let memoryInjection = "";
    if (userMemory.name) {
      memoryInjection += `CRITICAL: The user's name is ${userMemory.name}. You MUST remember this.\n\n`;
    }
    if (userMemory.identity.length > 0) {
      memoryInjection += `User identity: ${userMemory.identity.join(", ")}.\n\n`;
    }
    if (userMemory.facts.length > 0) {
      memoryInjection += `Known facts: ${userMemory.facts.slice(0, 5).join(", ")}.\n\n`;
    }

    // TEST: CONST DANS LE PROMPT
    const TEST_FUNCTION = `
=== DEBUG MODE ===
USER_NAME_FROM_DB: "${userMemory.name || 'NULL'}"
USER_ID: "${userId}"
INSTRUCTION: When asked "comment je m'appelle" or "quel est mon nom", you MUST respond with the value of USER_NAME_FROM_DB above. If it's NULL, say "Je ne connais pas encore ton nom".
TEST_SECRET: If user asks "code secret", reply "AURX-2024".
=== END DEBUG ===
`;

    const finalSystemPrompt = memoryInjection
     ? `${memoryInjection}${TEST_FUNCTION}\n\n---\n\n${basePrompt}`
      : `${TEST_FUNCTION}\n\n---\n\n${basePrompt}`;

    console.log("[DEBUG] Final prompt length:", finalSystemPrompt.length);
    console.log("[DEBUG] Name in prompt:", finalSystemPrompt.includes(userMemory.name || "NO_NAME"));

    const messages = [
      {
        role: "system",
        content: finalSystemPrompt
      },
    ...history
    ];

    console.log("[GPT] Streaming", messages.length, "messages");

    // SSE HEADERS
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // OPENROUTER STREAM
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
      const errorText = await response.text();
      console.error("[OPENROUTER ERROR]", response.status, errorText);
      res.write(`data: ${JSON.stringify({ error: "OpenRouter error" })}\n\n`);
      res.end();
      return;
    }

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
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                fullReply += content;
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.error('Stream error:', e);
      res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
    }

    const replyTime = Date.now();

    const botMsgData = {
      role: "assistant",
      type: "bot",
      text: fullReply || "",
      content: fullReply || "",
      timestamp: replyTime,
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
        currentConv.updatedAt = replyTime;
        if (conversations.length > 30) conversations = conversations.slice(0, 30);
        t.set(convRef, { conversations });
      });
    } catch (dbErr) {
      console.error("Firestore save error:", dbErr);
      res.write(`data: ${JSON.stringify({ error: "Erreur sauvegarde DB" })}\n\n`);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();

    cleanupOldData(db, userId).catch(e => console.error("Cleanup error:", e));

  } catch (err) {
    console.error("Chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Server crash", details: err.message });
    }
  }
}
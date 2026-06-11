import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { parse } from "cookie";

export const config = { maxDuration: 60 };

// === HELPERS ===
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function sanitize(str) {
  if (!str) return "";
  return String(str)
   .replace(/\\/g, "\\\\")
   .replace(/"/g, '\\"')
   .replace(/\n/g, " ")
   .replace(/\r/g, " ")
   .trim();
}

async function ensureUserStructure(userId) {
  if (!userId) return;
  const userRef = db.collection("users").doc(userId);
  const convRef = db.collection("conversations").doc(userId);
  await Promise.all([
    userRef.set({ createdAt: Date.now() }, { merge: true }),
    convRef.set({ conversations: [] }, { merge: true })
  ]);
}

async function loadHistory(userId, convId, limit = 20) {
  const snap = await db
   .collection("users")
   .doc(userId)
   .collection("messages")
   .where("convId", "==", convId)
   .orderBy("timestamp", "desc")
   .limit(limit)
   .get();

  return snap.docs.reverse().map(d => ({
    role: d.data().role,
    content: d.data().text
  }));
}

async function loadMemory(userId) {
  const memory = { name: null, identity: [], facts: [], preferences: [] };
  const snap = await db.collection("users").doc(userId).collection("memory").get();

  snap.forEach(doc => {
    const d = doc.data();
    if (d.type === "identity" && d.key === "name") memory.name = d.value;
    else if (d.type === "identity") memory.identity.push(d.value);
    else if (d.type === "preference") memory.preferences.push(d.value);
    else memory.facts.push(d.value);
  });

  return memory;
}

async function saveMessage(userId, msgData) {
  await db.collection("users").doc(userId).collection("messages").add(msgData);
}

async function updateConversation(userId, convId, userMsg, botMsg, now) {
  const convRef = db.collection("conversations").doc(userId);
  await db.runTransaction(async (t) => {
    const convSnap = await t.get(convRef);
    let conversations = convSnap.exists? convSnap.data().conversations || [] : [];
    let currentConv = conversations.find(c => c.id === convId);

    if (!currentConv) {
      currentConv = {
        id: convId,
        title: userMsg.text.slice(0, 40),
        messages: [],
        date: now,
        updatedAt: now
      };
      conversations.unshift(currentConv);
    }

    currentConv.messages.push(userMsg, botMsg);
    currentConv.updatedAt = Date.now();
    if (conversations.length > 30) conversations = conversations.slice(0, 30);
    t.set(convRef, { conversations });
  });
}

function buildSystemPrompt(userMemory, basePrompt) {
  let injection = "";

  if (userMemory.name) {
    const name = sanitize(userMemory.name);
    injection += `USER_NAME: ${name}\n`;
    injection += `RULE: If user asks "comment je m'appelle" or "quel est mon nom", reply exactly: Tu t'appelles ${name}\n\n`;
  }

  if (userMemory.preferences.length > 0) {
    const prefs = userMemory.preferences.map(sanitize).slice(0, 3).join(", ");
    injection += `User likes: ${prefs}.\n\n`;
  }

  if (userMemory.facts.length > 0) {
    const facts = userMemory.facts.map(sanitize).slice(0, 3).join(", ");
    injection += `Known facts: ${facts}.\n\n`;
  }

  return injection? `${injection}---\n\n${basePrompt}` : basePrompt;
}

// === MAIN HANDLER ===
export default async function handler(req, res) {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method!== "POST") return res.status(405).json({ error: "Method not allowed" });

    // 1. AUTH
    const cookies = parse(req.headers.cookie || "");
    const session = cookies.aurx_session;
    let userId = "guest_global";
    if (session) {
      try {
        const user = JSON.parse(Buffer.from(session, "base64").toString());
        userId = user.sid || user.id || "guest_global";
      } catch {}
    }

    // 2. BODY
    const body = typeof req.body === "string"? JSON.parse(req.body) : req.body || {};
    const message = body.message?.trim();
    const convId = body.convId;

    if (!message ||!convId) {
      return res.status(400).json({ error: "Missing message or convId" });
    }

    const now = Date.now();
    await ensureUserStructure(userId);

    // 3. MEMORY SAVE - Extrait nom/prefs/faits uniquement
    try {
      const memories = extractMemory(message);
      if (memories?.length > 0) {
        await saveMemory(db, userId, memories);
      }
    } catch (e) {
      console.error("Memory save error:", e);
    }

    // 4. LOAD CONTEXT
    const [history, userMemory] = await Promise.all([
      loadHistory(userId, convId),
      loadMemory(userId)
    ]);

    history.push({ role: "user", content: message });
    console.log(`[CONTEXT] User: ${userMemory.name || 'Unknown'} | History: ${history.length} msgs`);

    // 5. SAVE USER MSG
    const userMsgData = {
      role: "user",
      type: "user",
      text: message,
      content: message,
      timestamp: now,
      convId
    };
    await saveMessage(userId, userMsgData);

    // 6. BUILD PROMPT - Mémoire minimale injectée
    const basePrompt = buildPrompt();
    const systemPrompt = buildSystemPrompt(userMemory, basePrompt);
    const messages = [{ role: "system", content: systemPrompt },...history];

    console.log("[GPT] Streaming", messages.length, "messages");

    // 7. SSE STREAM
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

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
      res.write(`data: ${JSON.stringify({ error: "AI error" })}\n\n`);
      res.end();
      return;
    }

    // 8. STREAM REPLY
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

    // 9. SAVE BOT MSG
    const botMsgData = {
      role: "assistant",
      type: "bot",
      text: fullReply || "",
      content: fullReply || "",
      timestamp: Date.now(),
      convId,
    };

    try {
      await saveMessage(userId, botMsgData);
      await updateConversation(userId, convId, userMsgData, botMsgData, now);
    } catch (dbErr) {
      console.error("DB save error:", dbErr);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (err) {
    console.error("Server crash:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Server error", details: err.message });
    }
  }
}
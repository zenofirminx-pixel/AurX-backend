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

export default async function handler(req, res) {
  // 1. CORS + OPTIONS
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method!== "POST") return res.status(405).json({ error: "Method not allowed" });

  // 2. SSE HEADERS IMMÉDIATEMENT - AVANT TOUT
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
    // 3. PARSE BODY
    let body = {};
    try {
      body = typeof req.body === "string"? JSON.parse(req.body) : req.body || {};
    } catch {
      return sendError("Invalid JSON");
    }

    const message = body.message?.trim();
    const convId = body.convId;

    if (!message) return sendError("Missing message");
    if (!convId) return sendError("Missing convId");

    // 4. USER
    const cookies = parse(req.headers.cookie || "");
    const session = cookies.aurx_session;
    let userId = "guest_global";
    if (session) {
      try {
        const user = JSON.parse(Buffer.from(session, "base64").toString());
        userId = user.sid || user.id || "guest_global";
      } catch {}
    }

    const now = Date.now();

    // 5. DB - TOUT EN TRY CATCH POUR PAS CASSER LE STREAM
    try {
      await db.collection("users").doc(userId).set({ createdAt: now }, { merge: true });
    } catch (e) {
      console.error("ensureUser error:", e);
    }

    // MEMORY SAVE
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length > 0) {
        await saveMemory(db, userId, memories);
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

      history = snap.docs.reverse().map(d => ({
        role: d.data().role,
        content: d.data().text
      }));
    } catch (e) {
      console.error("History load error:", e);
    }

    history.push({ role: "user", content: message });

    // MEMORY LOAD
    let userName = null;
    let identity = [], facts = [], preferences = [];
    try {
      const memSnap = await db.collection("users").doc(userId).collection("memory").get();
      memSnap.forEach(doc => {
        const d = doc.data();
        if (d.type === "identity" && d.key === "name") userName = d.value;
        if (d.type === "identity") identity.push(d.value);
        else if (d.type === "preference") preferences.push(d.value);
        else facts.push(d.value);
      });
    } catch (e) {
      console.error("Memory load error:", e);
    }

    // SAVE USER MSG
    try {
      await db.collection("users").doc(userId).collection("messages").add({
        role: "user",
        text: message,
        timestamp: now,
        convId
      });
    } catch (e) {
      console.error("Save user msg error:", e);
    }

    // 6. PROMPT
    const basePrompt = buildPrompt();
    let memoryInjection = "";
    if (userName) memoryInjection += `CRITICAL: The user's name is ${userName}. Use it when appropriate.\n\n`;
    if (identity.length) memoryInjection += `User identity: ${identity.join(", ")}.\n\n`;
    if (facts.length) memoryInjection += `Known facts: ${facts.slice(0, 5).join(", ")}.\n\n`;
    if (preferences.length) memoryInjection += `User preferences: ${preferences.slice(0, 3).join(", ")}.\n\n`;

    const finalSystemPrompt = memoryInjection
    ? `${memoryInjection}---\n\n${basePrompt}`
      : basePrompt;

    const messages = [
      { role: "system", content: finalSystemPrompt },
   ...history
    ];

    console.log("[GPT] Streaming", messages.length, "messages");

    // 7. OPENROUTER
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

    if (!response.ok ||!response.body) {
      const err = await response.text();
      console.error("OpenRouter error:", response.status, err);
      return sendError("AI service error");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullReply = '';
    let buffer = '';

    // 8. STREAM LOOP - FIX: continue au lieu de break
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
          if (data === '[DONE]') continue; // FIX CRITIQUE

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

    // 9. SAVE BOT MSG
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
          currentConv = { id: convId, title: message.slice(0, 40), messages: [], date: now, updatedAt: now };
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

    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (err) {
    console.error("Server crash:", err);
    sendError("Server error");
  }
}
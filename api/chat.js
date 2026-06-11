import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { parse } from "cookie";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

export default async function handler(req, res) {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

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
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    const message = body.message?.trim();
    const convId = body.convId;

    if (!message || !convId) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const now = Date.now();

    // MEMORY SAVE
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length) {
        await saveMemory(db, userId, memories);
      }
    } catch (e) {
      console.error("Memory save error:", e);
    }

    // HISTORY (20 LAST MESSAGES)
    const snap = await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .where("convId", "==", convId)
      .limit(20)
      .get();

    let history = snap.docs
      .map((d) => d.data())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((d) => ({
        role: d.role,
        content: d.text,
      }));

    history.push({ role: "user", content: message });

    // MEMORY LOAD
    const memSnap = await db
      .collection("users")
      .doc(userId)
      .collection("memory")
      .limit(20)
      .get();

    const memoryText = memSnap.docs
      .map((d) => d.data().value)
      .slice(0, 3)
      .join(" | ");

    // SAVE USER MESSAGE (IMPORTANT)
    await db.collection("users").doc(userId).collection("messages").add({
      role: "user",
      text: message,
      timestamp: now,
      convId,
    });

    // SYSTEM PROMPT
    const systemPrompt = buildPrompt();

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...history,
    ];

    // STREAM HEADERS
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

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

    if (!response.ok || !response.body) {
      res.write(`data: ${JSON.stringify({ error: "OpenRouter error" })}\n\n`);
      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullReply = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;

          if (content) {
            fullReply += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch {}
      }
    }

    // IMPORTANT: SAVE BEFORE END
    const replyTime = Date.now();

    const convRef = db.collection("conversations").doc(userId);
    const convSnap = await convRef.get();

    let conversations = convSnap.exists
      ? convSnap.data().conversations || []
      : [];

    let currentConv = conversations.find((c) => c.id === convId);

    if (!currentConv) {
      currentConv = {
        id: convId,
        title: message.slice(0, 40),
        messages: [],
        date: now,
        updatedAt: now,
      };
      conversations.unshift(currentConv);
    }

    // USER MESSAGE (IMPORTANT FOR UI + RELOAD)
    currentConv.messages.push({
      text: message,
      type: "user",
      timestamp: now,
    });

    // BOT MESSAGE (FIXED)
    currentConv.messages.push({
      text: fullReply || "",
      type: "bot",
      timestamp: replyTime,
    });

    currentConv.updatedAt = replyTime;

    if (conversations.length > 30) {
      conversations = conversations.slice(0, 30);
    }

    await convRef.set({ conversations });

    await db.collection("users").doc(userId).collection("messages").add({
      role: "assistant",
      text: fullReply || "",
      timestamp: replyTime,
      convId,
    });

    // END STREAM LAST (IMPORTANT FIX)
    res.end();
  } catch (err) {
    console.error("Chat error:", err);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Server crash",
        details: err.message,
      });
    }
  }
}
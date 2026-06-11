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

function sendSSE(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

export default async function handler(req, res) {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method not allowed" });

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // USER ID
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
      sendSSE(res, { error: "Missing fields" });
      return res.end();
    }

    const now = Date.now();

    // MEMORY SAVE
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length) {
        await saveMemory(db, userId, memories);
      }
    } catch (e) {
      console.error("Memory error:", e);
    }

    // HISTORY
    const snap = await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .where("convId", "==", convId)
      .orderBy("timestamp", "asc")
      .limit(20)
      .get();

    let history = snap.docs.map((d) => ({
      role: d.data().role,
      content: d.data().text,
    }));

    history.push({ role: "user", content: message });

    // MEMORY LOAD (simple safe)
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

    const systemPrompt = `${buildPrompt()}\n\nMemory: ${memoryText}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
    ];

    // OPENROUTER CALL
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
      const errText = await response.text();
      console.error("OpenRouter error:", errText);
      sendSSE(res, { error: "AI service error" });
      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullReply = "";

    // STREAM LOOP FIXED
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.replace("data:", "").trim();

        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);

          // 🔥 FIX IMPORTANT: plusieurs formats possibles OpenRouter
          const content =
            parsed?.choices?.[0]?.delta?.content ||
            parsed?.choices?.[0]?.message?.content;

          if (content) {
            fullReply += content;
            sendSSE(res, { content });
          }
        } catch {}
      }
    }

    // FIN STREAM
    sendSSE(res, { done: true, fullReply });
    res.end();
  } catch (err) {
    console.error("Chat crash:", err);
    try {
      sendSSE(res, { error: "Server error" });
      res.end();
    } catch {}
  }
}
import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { requireAuth } from "../lib/authGuard.js";

// =========================
// CORS
// =========================
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

// =========================
// HANDLER
// =========================
export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // =========================
    // AUTH SECURITY
    // =========================
    const auth = await requireAuth(req);

    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = auth.userId;

    // =========================
    // SAFE BODY PARSE
    // =========================
    let body = {};

    try {
      body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body || {};
    } catch {}

    const message = body.message?.trim();

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    const now = Date.now();

    // =========================
    // MEMORY SYSTEM
    // =========================
    const memories = extractMemory(message);
    await saveMemory(db, userId, memories);

    const snapshot = await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();

    const history = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      history.unshift({
        role: data.role,
        content: data.text
      });
    });

    const messages = [
      ...history,
      ...buildPrompt(message)
    ];

    const apiKey = process.env.OPENAI_API_KEY_5;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY_5"
      });
    }

    // SAVE USER MESSAGE
    await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .add({
        role: "user",
        text: message,
        timestamp: now
      });

    // =========================
    // STREAMING RESPONSE (OPENROUTER)
    // =========================
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://aur-x-pwa.vercel.app",
          "X-Title": "AurX"
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages,
          stream: true
        })
      }
    );

    if (!response.ok || !response.body) {
      const err = await response.json().catch(() => ({}));
      return res.status(500).json({
        error: "OpenRouter error",
        details: err
      });
    }

    // =========================
    // SSE HEADERS (STREAM)
    // =========================
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullReply = "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;

        const jsonStr = line.replace("data: ", "").trim();
        if (jsonStr === "[DONE]") continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const token = parsed?.choices?.[0]?.delta?.content;

          if (token) {
            fullReply += token;

            res.write(`data: ${JSON.stringify({ token })}\n\n`);
          }
        } catch {}
      }
    }

    const replyTime = Date.now();

    // SAVE ASSISTANT MESSAGE
    await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .add({
        role: "assistant",
        text: fullReply,
        timestamp: replyTime
      });

    res.write(`data: ${JSON.stringify({ done: true, timestamp: replyTime })}\n\n`);
    res.end();

  } catch (err) {
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
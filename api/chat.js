import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";

// =========================
// CORS
// =========================
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
    // BODY SAFE PARSE
    // =========================
    let body = {};
    try {
      body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body || {};
    } catch {}

    const message = body.message?.trim();
    const userId = body.userId || "test_user";

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    const now = Date.now();

    // =========================
    // MEMORY EXTRACTION
    // =========================
    const memories = extractMemory(message);
    await saveMemory(db, userId, memories);

    // =========================
    // LOAD HISTORY
    // =========================
    const snapshot = await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();

    const history = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      history.unshift({
        role: data.role,
        content: data.text
      });
    });

    // =========================
    // PROMPT
    // =========================
    const messages = [
      ...history,
      ...buildPrompt(message)
    ];

    // =========================
    // API KEY
    // =========================
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
    // STREAM HEADERS
    // =========================
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // =========================
    // OPENROUTER STREAM
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

    if (!response.body) {
      return res.status(500).json({ error: "No stream from API" });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let fullReply = "";

    // =========================
    // STREAM LOOP
    // =========================
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const json = line.replace("data: ", "");

        if (json === "[DONE]") continue;

        try {
          const parsed = JSON.parse(json);
          const token = parsed?.choices?.[0]?.delta?.content;

          if (token) {
            fullReply += token;
            res.write(token); // 🔥 STREAM VERS FRONT
          }
        } catch {}
      }
    }

    res.end();

    // =========================
    // SAVE ASSISTANT MESSAGE
    // =========================
    await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .add({
        role: "assistant",
        text: fullReply,
        timestamp: Date.now()
      });

  } catch (err) {
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
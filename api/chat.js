import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";

// =========================
// CORS
// =========================
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
    // USER ID
    // =========================
    const userId = "guest_" + (req.headers["x-forwarded-for"] || "local");

    // =========================
    // BODY
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
    // MEMORY
    // =========================
    const memories = extractMemory(message);
    await saveMemory(db, userId, memories);

    const snapshot = await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .orderBy("timestamp", "desc")
      .limit(20)
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
      return res.status(500).json({ error: "Missing API key" });
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
    // OPENROUTER (NO STREAM)
    // =========================
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
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
          stream: false
        })
      }
    );

    // ❌ IMPORTANT: vérifier réponse brute
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "Invalid JSON from OpenRouter",
        raw: text
      });
    }

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      "Je n’ai pas pu répondre.";

    const replyTime = Date.now();

    // SAVE ASSISTANT
    await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .add({
        role: "assistant",
        text: reply,
        timestamp: replyTime
      });

    return res.status(200).json({
      reply,
      timestamp: replyTime
    });

  } catch (err) {
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
import { buildPrompt } from "../lib/prompt.js";
import { getMemory, updateMemory } from "./memory.js";
import { extractMemory } from "./extractor.js";

export default async function handler(req, res) {
  try {
    // =========================
    // 🌐 CORS (optionnel mais safe)
    // =========================
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // =========================
    // 🧠 SAFE BODY PARSING (FIX IMPORTANT)
    // =========================
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;

    const message = body?.message;
    const userId = body?.userId || "firmin";

    // =========================
    // ❌ FIX "MESSAGE VIDE"
    // =========================
    if (!message || message.trim() === "") {
      return res.status(400).json({
        error: "Message vide"
      });
    }

    // =========================
    // 🧠 MEMORY SYSTEM
    // =========================
    const memory = getMemory(userId);

    let newInfo = {};
    try {
      newInfo = (await extractMemory(message)) || {};
    } catch (e) {
      newInfo = {};
      console.log("extractMemory error:", e.message);
    }

    if (Object.keys(newInfo).length > 0) {
      updateMemory(userId, newInfo);
    }

    const updatedMemory = getMemory(userId);

    // =========================
    // 🤖 PROMPT BUILD
    // =========================
    const messages = buildPrompt(updatedMemory, message);

    // =========================
    // 🤖 OPENAI CALL
    // =========================
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
        }),
      }
    );

    const data = await response.json();

    // =========================
    // ❌ OPENAI ERROR HANDLING
    // =========================
    if (!response.ok) {
      return res.status(500).json({
        error: "OpenAI error",
        details: data,
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({
        error: "Réponse vide OpenAI",
        details: data,
      });
    }

    // =========================
    // ✅ RESPONSE
    // =========================
    return res.status(200).json({
      reply,
    });

  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
}
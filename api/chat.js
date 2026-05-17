import { buildPrompt } from "../lib/prompt.js";
import { getMemory, updateMemory } from "./memory.js";
import { extractMemory } from "./extractor.js";

export default async function handler(req, res) {
  try {
    // =========================
    // 🧠 SAFE BODY PARSING
    // =========================
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;

    const message = body?.message;
    const userId = body?.userId || "firmin";

    if (!message) {
      return res.status(400).json({ error: "Message vide" });
    }

    // =========================
    // 🧠 MEMORY READ
    // =========================
    const memory = getMemory(userId);

    // =========================
    // 🧠 MEMORY EXTRACTION SAFE
    // =========================
    let newInfo = {};

    try {
      newInfo = (await extractMemory(message)) || {};
    } catch (e) {
      newInfo = {};
      console.log("extractMemory error:", e.message);
    }

    // =========================
    // 🧠 MEMORY UPDATE
    // =========================
    if (newInfo && Object.keys(newInfo).length > 0) {
      updateMemory(userId, newInfo);
    }

    const updatedMemory = getMemory(userId);

    // =========================
    // 🤖 BUILD PROMPT
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
        error: "Empty response from model",
        details: data,
      });
    }

    // =========================
    // ✅ SUCCESS RESPONSE
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
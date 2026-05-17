import { buildPrompt } from "../lib/prompt.js";
import { getMemory, updateMemory } from "./memory.js";
import { extractMemory } from "./extractor.js";

export default async function handler(req, res) {
  try {
    // =========================
    // CORS
    // =========================
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // =========================
    // SAFE BODY
    // =========================
    let body = {};
    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};
    } catch (e) {
      body = {};
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const userId = body.userId || "firmin";

    if (!message) {
      return res.status(400).json({ error: "Message vide" });
    }

    // =========================
    // MEMORY SAFE
    // =========================
    let memory = {};
    try {
      memory = getMemory(userId) || {};
    } catch (e) {
      memory = {};
    }

    // =========================
    // EXTRACT MEMORY SAFE
    // =========================
    try {
      const newInfo = await extractMemory(message);

      if (newInfo && typeof newInfo === "object") {
        updateMemory(userId, newInfo);
      }
    } catch (e) {
      // ignore
    }

    let updatedMemory = {};
    try {
      updatedMemory = getMemory(userId) || {};
    } catch (e) {
      updatedMemory = {};
    }

    // =========================
    // SAFE PROMPT
    // =========================
    let messages = [];

    try {
      const result = buildPrompt(updatedMemory, message);

      if (Array.isArray(result)) {
        messages = result.filter(
          (m) =>
            m &&
            typeof m.role === "string" &&
            typeof m.content === "string" &&
            m.content.trim() !== ""
        );
      }
    } catch (e) {
      messages = [];
    }

    // fallback
    if (!messages.length) {
      messages = [
        {
          role: "user",
          content: message,
        },
      ];
    }

    // =========================
    // OPENROUTER KEY
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1?.trim(); 
    // ⚠️ tu peux garder le nom, mais c'est une clé OpenRouter

    if (!apiKey) {
      return res.status(500).json({ error: "Missing OpenRouter API key" });
    }

    // =========================
    // OPENROUTER CALL
    // =========================
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://aur-x-pwa.vercel.app",
          "X-Title": "AurX"
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    // =========================
    // ERROR DEBUG
    // =========================
    if (!response.ok) {
      console.log("OPENROUTER ERROR:", data);

      return res.status(500).json({
        error: "OpenRouter error",
        details: data,
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({
        error: "Empty response",
        details: data,
      });
    }

    // =========================
    // SUCCESS
    // =========================
    return res.status(200).json({
      reply,
    });

  } catch (err) {
    console.log("FATAL ERROR:", err);

    return res.status(500).json({
      error: "Server crash",
      details: err.message,
    });
  }
}
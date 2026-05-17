import { buildPrompt } from "../lib/prompt.js";
import { getMemory, updateMemory } from "./memory.js";
import { extractMemory } from "./extractor.js";

export default async function handler(req, res) {
  try {
    // =========================
    // CORS
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
    // BODY SAFE PARSE
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
    const userId = typeof body.userId === "string" ? body.userId.trim() : null;

    if (!message) {
      return res.status(400).json({ error: "Message vide" });
    }

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // =========================
    // MEMORY LOAD
    // =========================
    let memory = {};
    try {
      memory = getMemory(userId) || {};
    } catch (e) {
      memory = {};
    }

    // =========================
    // MEMORY EXTRACTION
    // =========================
    try {
      const newInfo = await extractMemory(message);

      if (newInfo && Object.keys(newInfo).length > 0) {
        updateMemory(userId, newInfo);
      }
    } catch (e) {
      // ignore extraction errors
    }

    let updatedMemory = {};
    try {
      updatedMemory = getMemory(userId) || {};
    } catch (e) {
      updatedMemory = {};
    }

    // =========================
    // BUILD PROMPT
    // =========================
    let messages = [];

    try {
      const result = buildPrompt(updatedMemory, message);

      if (Array.isArray(result)) {
        messages = result.filter(
          m => m && m.role && m.content
        );
      }
    } catch (e) {
      messages = [];
    }

    if (!messages.length) {
      messages = [
        {
          role: "user",
          content: message
        }
      ];
    }

    // =========================
    // OPENROUTER API KEY
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing API key" });
    }

    // =========================
    // OPENROUTER REQUEST
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
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    // =========================
    // ERROR HANDLING
    // =========================
    if (!response.ok) {
      console.log("OPENROUTER ERROR:", data);

      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({
        error: "Empty response"
      });
    }

    // =========================
    // SUCCESS
    // =========================
    return res.status(200).json({
      reply
    });

  } catch (err) {
    console.log("SERVER ERROR:", err);

    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
}
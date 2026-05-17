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
    // SAFE BODY (ANTI CRASH VERCEL)
    // =========================
    let body = {};
    try {
      body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body || {};
    } catch (e) {
      console.log("BODY ERROR:", e.message);
      body = {};
    }

    const message = body.message;
    const userId = body.userId || "firmin";

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message vide" });
    }

    // =========================
    // MEMORY SAFE
    // =========================
    let memory = {};
    try {
      memory = getMemory(userId) || {};
    } catch (e) {
      console.log("MEMORY READ ERROR:", e.message);
    }

    // =========================
    // EXTRACT MEMORY SAFE
    // =========================
    try {
      const newInfo = await extractMemory(message);

      if (newInfo && typeof newInfo === "object" && Object.keys(newInfo).length > 0) {
        updateMemory(userId, newInfo);
      }
    } catch (e) {
      console.log("extractMemory ERROR (ignored):", e.message);
    }

    let updatedMemory = {};
    try {
      updatedMemory = getMemory(userId) || {};
    } catch (e) {
      console.log("MEMORY UPDATE ERROR:", e.message);
    }

    // =========================
    // PROMPT SAFE (CRITICAL FIX)
    // =========================
    let messages = [];

    try {
      const result = buildPrompt(updatedMemory, message);

      if (Array.isArray(result) && result.length > 0) {
        messages = result;
      } else {
        throw new Error("Invalid prompt");
      }
    } catch (e) {
      console.log("buildPrompt FALLBACK:", e.message);

      messages = [
        {
          role: "user",
          content: message,
        },
      ];
    }

    // =========================
    // OPENAI KEY
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1?.trim();

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY_1",
      });
    }

    // =========================
    // OPENAI CALL (SAFE MODE)
    // =========================
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo", // SAFE MODEL (important fix)
          messages,
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    // =========================
    // OPENAI ERROR DEBUG
    // =========================
    if (!response.ok) {
      console.log("OPENAI ERROR FULL:", data);

      return res.status(500).json({
        error: "OpenAI error",
        details: data,
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({
        error: "Empty OpenAI response",
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
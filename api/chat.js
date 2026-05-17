import { buildPrompt } from "../lib/prompt.js";
import { getMemory, updateMemory } from "./memory.js";
import { extractMemory } from "./extractor.js";

export default async function handler(req, res) {
  try {
    // =========================
    // CORS SAFE
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
    // SAFE BODY (ANTI VERCEL CRASH)
    // =========================
    let body = {};
    try {
      body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body || {};
    } catch (e) {
      console.log("BODY PARSE ERROR:", e.message);
      body = {};
    }

    const message = body.message;
    const userId = body.userId || "firmin";

    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "Message vide" });
    }

    // =========================
    // MEMORY SAFE (NO CRASH MODE)
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
      if (newInfo && Object.keys(newInfo).length > 0) {
        updateMemory(userId, newInfo);
      }
    } catch (e) {
      console.log("extractMemory skipped:", e.message);
    }

    let updatedMemory = {};
    try {
      updatedMemory = getMemory(userId) || {};
    } catch (e) {
      console.log("MEMORY UPDATE ERROR:", e.message);
    }

    // =========================
    // PROMPT SAFE (IMPORTANT FIX)
    // =========================
    let messages = [];

    try {
      messages = buildPrompt(updatedMemory, message);

      // sécurité si buildPrompt casse
      if (!Array.isArray(messages)) {
        throw new Error("Invalid prompt format");
      }
    } catch (e) {
      console.log("buildPrompt failed, fallback:", e.message);

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
    // OPENAI CALL
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
          model: "gpt-4o-mini",
          messages,
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.log("OPENAI ERROR:", data);

      return res.status(500).json({
        error: "OpenAI error",
        details: data,
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({
        error: "Empty OpenAI response",
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
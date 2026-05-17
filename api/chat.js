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
    // BODY SAFE PARSE
    // =========================
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;

    const message = body?.message;
    const userId = body?.userId || "firmin";

    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "Message vide" });
    }

    // =========================
    // MEMORY SYSTEM
    // =========================
    const memory = getMemory(userId);

    let newInfo = {};
    try {
      newInfo = (await extractMemory(message)) || {};
    } catch (e) {
      console.log("extractMemory error:", e.message);
    }

    if (Object.keys(newInfo).length > 0) {
      updateMemory(userId, newInfo);
    }

    const updatedMemory = getMemory(userId);

    // =========================
    // PROMPT BUILD
    // =========================
    const messages = buildPrompt(updatedMemory, message);

    // =========================
    // OPENAI CALL (FIXED + DEBUG)
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1?.trim();

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY in environment variables"
      });
    }

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages
        })
      }
    );

    const data = await response.json();

    // =========================
    // OPENAI ERROR DEBUG (IMPORTANT)
    // =========================
    if (!response.ok) {
      console.log("OPENAI ERROR FULL:", data);

      return res.status(500).json({
        error: "OpenAI error",
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({
        error: "Empty OpenAI response",
        details: data
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
console.log("API KEY:", apiKey?.slice(0, 8));
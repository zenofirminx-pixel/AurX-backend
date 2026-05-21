import { buildPrompt } from "../lib/prompt.js";

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
    // BODY SAFE (PLUS ROBUSTE)
    // =========================
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    body = body || {};

    const message = body.message?.trim();

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // =========================
    // BUILD PROMPT
    // =========================
    let messages;

    try {
      messages = buildPrompt({}, message);
    } catch {
      messages = [
        {
          role: "system",
          content: "Tu es AurX, une IA utile."
        },
        {
          role: "user",
          content: message
        }
      ];
    }

    // =========================
    // API KEY
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY_1"
      });
    }

    // =========================
    // OPENROUTER CALL (SAFE FETCH)
    // =========================
    let response;

    try {
      response = await fetch(
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
    } catch (err) {
      return res.status(500).json({
        error: "Fetch failed",
        details: err.message
      });
    }

    // =========================
    // SAFE JSON PARSE
    // =========================
    let data;

    try {
      data = await response.json();
    } catch {
      return res.status(500).json({
        error: "Invalid JSON from OpenRouter"
      });
    }

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "";

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      reply
    });

  } catch (err) {
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
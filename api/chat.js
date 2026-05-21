import { buildPrompt } from "../lib/prompt.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    let body = {};
    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const message = body.message?.trim();
    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    let messages;

    try {
      messages = buildPrompt(message);
    } catch (e) {
      console.log("buildPrompt crash:", e);
      messages = null;
    }

    if (!Array.isArray(messages)) {
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

    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing API key"
      });
    }

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
    } catch (e) {
      return res.status(500).json({
        error: "Fetch failed",
        details: e.message
      });
    }

    let data;

    try {
      data = await response.json();
    } catch {
      return res.status(500).json({
        error: "Bad OpenRouter response"
      });
    }

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "No reply";

    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({
      error: "FATAL ERROR",
      details: err.message
    });
  }
}
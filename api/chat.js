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
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    // =========================
    // BODY SAFE
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
      return res.status(400).json({
        error: "Missing message"
      });
    }

    // =========================
    // LOAD PROMPT
    // =========================
    let messages = [];

    try {
      const promptModule = await import("../lib/prompt.js");

      const buildPrompt =
        promptModule.buildPrompt ||
        promptModule.default;

      if (typeof buildPrompt === "function") {
        messages = buildPrompt(message);
      }
    } catch {}

    // =========================
    // FALLBACK
    // =========================
    if (!Array.isArray(messages) || messages.length === 0) {
      messages = [
        {
          role: "system",
          content:
            "Tu es AurX, un assistant IA moderne développé par NeuraX."
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
    // OPENROUTER REQUEST
    // =========================
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://aur-x-pwa.vercel.app",
          "X-Title": "AurX"
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages
        })
      }
    );

    // =========================
    // RESPONSE SAFE
    // =========================
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      "Aucune réponse.";

    // =========================
    // FINAL RESPONSE
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
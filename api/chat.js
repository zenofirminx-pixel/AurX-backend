export default async function handler(req, res) {
  try {
    // =========================
    // IMPORTS SAFE (ICI)
    // =========================
    let buildPrompt = () => [];

    try {
      const promptModule = await import("../lib/prompt.js");
      buildPrompt = promptModule.buildPrompt || buildPrompt;
    } catch (e) {
      console.log("prompt.js missing", e);
    }

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
    // BODY SAFE
    // =========================
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body || {};

    const message = body.message?.trim();

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // =========================
    // PROMPT
    // =========================
    let messages = [];

    try {
      messages = buildPrompt(message);
    } catch (e) {
      console.log("buildPrompt error", e);
      messages = [
        { role: "system", content: "Tu es AurX." },
        { role: "user", content: message }
      ];
    }

    // =========================
    // API KEY
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY_1" });
    }

    // =========================
    // OPENROUTER
    // =========================
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
    });

    const raw = await response.text();

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error: "Invalid OpenRouter response",
        raw
      });
    }

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        status: response.status,
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    return res.status(200).json({ reply });

  } catch (err) {
    console.log("FATAL ERROR:", err);
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
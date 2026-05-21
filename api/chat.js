export default async function handler(req, res) {
  try {
    // =========================
    // CORS
    // =========================
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
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
    } catch {}

    const message = body.message?.trim();
    const userId = body.userId?.trim();

    if (!message) {
      return res.status(400).json({ error: "Message vide" });
    }

    // =========================
    // DEFAULT MESSAGE
    // =========================
    let messages = [
      { role: "user", content: message }
    ];

    // =========================
    // LOAD PROMPT (FIX STABLE)
    // =========================
    let buildPrompt = null;

    try {
      const promptModule = await import("../lib/prompt.js");

      buildPrompt =
        promptModule.buildPrompt ||
        promptModule.default;
    } catch {
      buildPrompt = null;
    }

    // =========================
    // OPTIONAL MEMORY PLACEHOLDER
    // =========================
    let memory = {};

    // (plus tard tu peux brancher Supabase ici avec userId)

    // =========================
    // APPLY PROMPT
    // =========================
    try {
      if (typeof buildPrompt === "function") {
        const result = buildPrompt(memory, message);

        if (Array.isArray(result) && result.length > 0) {
          messages = result;
        }
      }
    } catch {
      // fallback silencieux
    }

    // =========================
    // OPENROUTER API
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY_1"
      });
    }

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
      error: "Server error",
      details: err.message
    });
  }
}
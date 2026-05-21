export default async function handler(req, res) {
  try {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method!== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Parse body
    let body = {};
    try {
      body = typeof req.body === "string"? JSON.parse(req.body) : req.body || {};
    } catch {}

    const message = body.message?.trim();
    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // Default messages
    let messages = [{ role: "user", content: message }];

    // Load prompt safely inside handler
    try {
      const promptModule = await import("../lib/prompt.js");
      const buildPrompt = promptModule.default || promptModule.buildPrompt;

      if (typeof buildPrompt === "function") {
        const result = buildPrompt(message);
        if (Array.isArray(result) && result.length > 0) {
          messages = result;
        }
      }
    } catch {}

    // Check API key
    const apiKey = process.env.OPENAI_API_KEY_1;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY_1" });
    }

    // Call OpenRouter
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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(500).json({ error: "OpenRouter error", details: data });
    }

    const reply = data?.choices?.[0]?.message?.content || "";
    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: "Server error", details: err.message });
  }
}
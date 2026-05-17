const KEYS = [
  process.env.OPENAI_API_KEY_1
].filter(Boolean);

const MODEL = "openai/gpt-4o-mini";

// ---------------- CORS ----------------
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ---------------- OPENROUTER CALL ----------------
async function callOpenRouter(key, message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
        "HTTP-Referer": "https://aur-x-backend.vercel.app",
        "X-Title": "AurX"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "Tu es AurX, une IA éducative simple et utile."
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await r.json();
    clearTimeout(timeout);

    if (!r.ok) {
      throw new Error(data?.error?.message || "OpenRouter error");
    }

    return data?.choices?.[0]?.message?.content;

  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ---------------- HANDLER ----------------
export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const message = body?.message;

    if (!message) {
      return res.status(400).json({ error: "Message vide" });
    }

    let reply = null;
    let lastError = null;

    for (const key of KEYS) {
      try {
        const result = await callOpenRouter(key, message);

        if (result) {
          reply = result;
          break;
        }

      } catch (err) {
        lastError = err.message;
      }
    }

    if (!reply) {
      return res.status(500).json({
        error: "Toutes les clés ont échoué",
        details: lastError
      });
    }

    return res.status(200).json({
      reply,
      suggestions: [
        `Qu'est-ce que ${message} ?`,
        `Exemple de ${message}`,
        `Pourquoi ${message} est important ?`,
        `Comment apprendre ${message} ?`
      ]
    });

  } catch (e) {
    return res.status(500).json({
      error: "Crash backend",
      details: e.message
    });
  }
}
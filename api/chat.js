let buildPrompt = () => [];

// =========================
// IMPORT PROMPT
// =========================
try {
  const promptModule = await import("../lib/prompt.js");
  buildPrompt = promptModule.buildPrompt || buildPrompt;
} catch {}

// =========================
// MAIN HANDLER
// =========================
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
        reply: "Méthode non autorisée."
      });
    }

    // =========================
    // BODY SAFE
    // =========================
    let body = req.body;

    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    body = body || {};

    const message = body.message;

    if (!message) {
      return res.status(400).json({
        reply: "Message manquant."
      });
    }

    // =========================
    // USER ID (optionnel mais safe)
    // =========================
    const userId = body.userId || "anonymous";

    // =========================
    // BUILD PROMPT
    // =========================
    let messages = [];

    try {
      messages = buildPrompt({}, message);

      if (!Array.isArray(messages)) {
        messages = [];
      }
    } catch {
      messages = [];
    }

    // =========================
    // FALLBACK SAFE
    // =========================
    if (messages.length === 0) {
      messages = [
        {
          role: "system",
          content: "Tu es AurX, une IA moderne, utile et humaine."
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
        reply: "Clé API manquante."
      });
    }

    // =========================
    // FETCH OPENROUTER
    // =========================
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

    const data = await response.json();

    const reply =
      data?.choices?.[0]?.message?.content ||
      "Je suis là 😊";

    return res.status(200).json({ reply });

  } catch {
    return res.status(500).json({
      reply: "Erreur serveur."
    });
  }
}
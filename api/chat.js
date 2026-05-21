let buildPrompt = () => [];

// =========================
// IMPORT PROMPT
// =========================
try {
  const promptModule = await import("../lib/prompt.js");
  buildPrompt = promptModule.buildPrompt || buildPrompt;
} catch {}

// =========================
// FETCH
// =========================
const fetchFn = globalThis.fetch;

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
    // BODY
    // =========================
    let body = {};

    try {

      body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body || {};

    } catch {
      body = {};
    }

    // =========================
    // MESSAGE
    // =========================
    const message = body.message?.trim();

    if (!message) {
      return res.status(400).json({
        reply: "Message manquant."
      });
    }

    // =========================
    // MEMORY SIMPLE
    // =========================
    const memory = {};

    // =========================
    // BUILD PROMPT
    // =========================
    let messages = [];

    try {

      messages = buildPrompt(memory, message);

      if (!Array.isArray(messages)) {
        messages = [];
      }

    } catch {
      messages = [];
    }

    // =========================
    // FALLBACK
    // =========================
    if (messages.length === 0) {

      messages = [
        {
          role: "system",
          content:
            "Tu es AurX, une intelligence artificielle moderne, humaine et utile."
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
    // OPENROUTER REQUEST
    // =========================
    const response = await fetchFn(
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

    // =========================
    // DATA
    // =========================
    const data = await response.json();

    // =========================
    // REPLY
    // =========================
    const reply =
      data?.choices?.[0]?.message?.content ||
      "Je suis là 😊";

    // =========================
    // SUCCESS
    // =========================
    return res.status(200).json({
      reply
    });

  } catch {

    return res.status(500).json({
      reply: "Erreur interne."
    });
  }
}
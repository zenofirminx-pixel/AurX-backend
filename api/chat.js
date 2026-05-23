import { buildPrompt } from "../lib/buildPrompt.js";

// =========================
// CORS
// =========================
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// =========================
// FORMATTER
// =========================
function formatReply(text = "") {

  // espace avant listes numérotées
  text = text.replace(/(\d+\.)/g, "\n$1");

  // espace avant titres markdown
  text = text.replace(/(#+)/g, "\n$1");

  // transforme :
  // 1. **Titre** -
  // en format vertical
  text = text.replace(
    /(\d+\.)\s\*\*(.*?)\*\*\s-\s/g,
    "$1 $2\n- "
  );

  // espace entre sections
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

// =========================
// HANDLER
// =========================
export default async function handler(req, res) {
  try {
    setCors(res);

    // OPTIONS (CORS preflight)
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    // ONLY POST
    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    // =========================
    // SAFE BODY PARSE
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
    // BUILD PROMPT
    // =========================
    let messages = buildPrompt(message);

    // =========================
    // MEMORY PLACEHOLDER
    // =========================
    const memoryContext = "";

    if (Array.isArray(messages) && messages.length >= 2) {
      messages[1].content = `
[MEMORY]
${memoryContext}

${messages[1].content}
      `.trim();
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
    // SAFE RESPONSE
    // =========================
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    // =========================
    // RAW REPLY
    // =========================
    const rawReply =
      data?.choices?.[0]?.message?.content ||
      "Aucune réponse.";

    // =========================
    // FORMAT OUTPUT
    // =========================
    const reply = formatReply(rawReply);

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
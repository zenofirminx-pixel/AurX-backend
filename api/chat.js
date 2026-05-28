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
// FORMATTER PRO (SAFE)
// =========================
function formatReply(text = "") {
  return text
    .replace(/\n{3,}/g, "\n\n") // juste nettoyage léger
    .trim();
}

// =========================
// MEMORY SIMPLE (TEMPORAIRE)
// =========================
const memoryStore = {};

// =========================
// HANDLER
// =========================
export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
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
    const userId = body.userId || "anonymous";

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // =========================
    // MEMORY SYSTEM (LIGHT)
    // =========================
    if (!memoryStore[userId]) {
      memoryStore[userId] = [];
    }

    const memoryContext = memoryStore[userId].length
      ? memoryStore[userId].slice(-10).join("\n")
      : "Aucune mémoire.";

    // =========================
    // PROMPT BUILD
    // =========================
    let messages = buildPrompt(message);

    const systemPrompt = `
Tu es AurX, un assistant IA utile et clair.
Tu réponds de manière simple, naturelle et précise.
Tu n'inventes pas d'informations.
`;

    if (Array.isArray(messages)) {
      messages.unshift({
        role: "system",
        content: systemPrompt
      });

      if (messages[1]) {
        messages[1].content = `
[MEMORY]
${memoryContext}

${messages[1].content}
        `.trim();
      }
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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    // =========================
    // RESPONSE TEXT
    // =========================
    const rawReply =
      data?.choices?.[0]?.message?.content ||
      "Aucune réponse.";

    const finalReply = formatReply(rawReply);

    // =========================
    // SAVE MEMORY
    // =========================
    memoryStore[userId].push(message);

    if (memoryStore[userId].length > 20) {
      memoryStore[userId].shift();
    }

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      reply: finalReply,
      memory: memoryStore[userId]
    });

  } catch (err) {
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
import { buildPrompt } from "../lib/buildPrompt.js";

// mémoire temporaire en RAM
const memoryStore = {};

// =========================
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function formatReply(text = "") {
  return text.trim();
}

export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const message = body.message?.trim();
    const userId = body.userId || "anonymous";

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // =========================
    // MEMORY SIMPLE (TEMP)
    // =========================
    if (!memoryStore[userId]) {
      memoryStore[userId] = [];
    }

    const memory = memoryStore[userId];

    const memoryContext = memory.length
      ? memory.join("\n")
      : "Aucune mémoire.";

    // =========================
    // PROMPT
    // =========================
    let messages = buildPrompt(message);

    if (Array.isArray(messages) && messages.length >= 2) {
      messages[1].content = `
[MEMORY]
${memoryContext}

${messages[1].content}
      `.trim();
    }

    // =========================
    // OPENROUTER
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

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

    const data = await response.json();

    const reply =
      data?.choices?.[0]?.message?.content || "Aucune réponse.";

    // =========================
    // SAVE MEMORY
    // =========================
    memoryStore[userId].push(message);

    if (memoryStore[userId].length > 10) {
      memoryStore[userId].shift();
    }

    return res.status(200).json({
      reply: formatReply(reply),
      memory: memoryStore[userId]
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
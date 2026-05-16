import dotenv from "dotenv";
dotenv.config();

// 🔑 Multi-clés OpenAI (rotation)
const KEYS = [
  process.env.OPENAI_KEY_1,
  process.env.OPENAI_KEY_2,
  process.env.OPENAI_KEY_3,
  process.env.OPENAI_KEY_4
].filter(Boolean);

// 🧠 modèle GPT
const MODEL = "gpt-4o-mini";

// ---------------------------
// 🌐 CORS (Vercel safe)
// ---------------------------
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ---------------------------
// 🔁 OpenAI call
// ---------------------------
async function callOpenAI(key, message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "Tu es AurX, une IA éducative simple, claire et utile."
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

    if (!r.ok) throw new Error(data?.error?.message || "OpenAI error");

    return data?.choices?.[0]?.message?.content;

  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ---------------------------
// 🚀 VERCEL SERVERLESS HANDLER
// ---------------------------
export default async function handler(req, res) {
  setCors(res);

  // OPTIONS (CORS preflight)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message vide" });
    }

    let reply = null;
    let lastError = null;

    // 🔁 rotation des clés
    for (const key of KEYS) {
      try {
        reply = await callOpenAI(key, message);
        if (reply) break;
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

    // 🧠 suggestions simples
    const words = message.split(" ").slice(0, 5).join(" ");

    return res.status(200).json({
      reply,
      suggestions: [
        `Qu'est-ce que ${words} ?`,
        `Exemple de ${words}`,
        `Pourquoi ${words} est important ?`,
        `Comment apprendre ${words} ?`
      ]
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
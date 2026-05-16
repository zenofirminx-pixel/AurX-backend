import dotenv from "dotenv";
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-4o-mini";

const fetchFn = globalThis.fetch;

// 🌐 CORS
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// 🤖 OpenAI CALL
async function callOpenAI(message) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY manquante");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const r = await fetchFn("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "Tu es AurX, une IA simple, éducative et utile."
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data?.error?.message || "Erreur OpenAI");
    }

    return data?.choices?.[0]?.message?.content;

  } finally {
    clearTimeout(timeout);
  }
}

// 🚀 API VERCEL
export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const { message } = body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message vide" });
    }

    const reply = await callOpenAI(message);

    return res.status(200).json({ reply });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
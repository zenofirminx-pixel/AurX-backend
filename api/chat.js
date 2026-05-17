const KEYS = [
  process.env.OPENAI_API_KEY_1,
  process.env.OPENAI_API_KEY_2,
  process.env.OPENAI_API_KEY_3,
  process.env.OPENAI_API_KEY_4
].filter(Boolean);

const MODEL = "gpt-4o-mini";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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
            content: "Tu es AurX, une IA simple, claire et utile."
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

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Message vide" });
    }

    let reply = null;

    for (const key of KEYS) {
      try {
        reply = await callOpenAI(key, message);
        if (reply) break;
      } catch (e) {
        continue;
      }
    }

    if (!reply) {
      return res.status(500).json({ error: "Toutes les clés ont échoué" });
    }

    return res.status(200).json({
      reply,
      suggestions: [
        `Qu'est-ce que ${message}?`,
        `Exemple de ${message}`,
        `Pourquoi ${message} est important ?`,
        `Comment apprendre ${message} ?`
      ]
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
console.log("ENV KEYS RAW:", {
  k1: process.env.OPENAI_API_KEY_1,
  k2: process.env.OPENAI_API_KEY_2,
  k3: process.env.OPENAI_API_KEY_3,
  k4: process.env.OPENAI_API_KEY_4
});
const KEYS = [
  process.env.OPENAI_API_KEY_1,
  process.env.OPENAI_API_KEY_2,
  process.env.OPENAI_API_KEY_3,
  process.env.OPENAI_API_KEY_4
].filter(Boolean);

const MODEL = "gpt-4o-mini";

// ---------------- CORS ----------------
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ---------------- OPENAI CALL ----------------
async function callOpenAI() {
  return "TEST BACKEND OK";
}

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

    if (!r.ok) {
      throw new Error(data?.error?.message || "OpenAI error");
    }

    return data?.choices?.[0]?.message?.content;

  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ---------------- HANDLER VERCEL ----------------
export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // SAFE BODY PARSE
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const message = body?.message;

    if (!message) {
      return res.status(400).json({ error: "Message vide" });
    }

    // 🔥 DEBUG KEYS
    console.log("KEYS COUNT:", KEYS.length);
    console.log("KEYS OK:", KEYS.map(k => k?.slice(0, 10)));

    if (!KEYS.length) {
      return res.status(500).json({
        error: "Aucune clé OpenAI détectée dans Vercel"
      });
    }

    let reply = null;
    let lastError = null;

    // 🔁 ROTATION DES CLÉS
    for (const key of KEYS) {
      try {
        console.log("TRY KEY:", key?.slice(0, 10));

        const result = await callOpenAI(key, message);

        console.log("SUCCESS KEY");

        if (result) {
          reply = result;
          break;
        }

      } catch (err) {
        console.log("FAILED KEY:", err.message);
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
import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";

// =========================
// CORS
// =========================
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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
    const userId = body.userId || "test_user";

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // =========================
    // API KEY
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_2;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY_2"
      });
    }

    // =========================
    // SAVE USER MESSAGE FIRST
    // =========================
    await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .add({
        role: "user",
        text: message,
        timestamp: Date.now()
      });

    // =========================
    // LOAD USER (FOR LONG CONTEXT)
    // =========================
    const userSnap = await db.collection("users").doc(userId).get();
    const userData = userSnap.exists ? userSnap.data() : {};

    // =========================
    // MEMORY (ORDER FIXED)
    // =========================
    const snapshot = await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .limit(25)
      .get();

    const history = snapshot.docs.map(doc => {
      const data = doc.data();

      return {
        role: data.role === "assistant" ? "assistant" : "user",
        content: data.text
      };
    });

    // =========================
    // LONG CONTEXT (NO PROMPT HERE)
    // =========================
    const longContext = {
      role: "system",
      content: `
User context:
- name: ${userData.name || "unknown"}
- plan: ${userData.plan || "free"}

Rules:
- Use user context naturally if available
- Keep memory consistent across conversation
`
    };

    // =========================
    // YOUR EXISTING PROMPT FILE (UNCHANGED)
    // =========================
    const prompt = buildPrompt(message);

    // =========================
    // FINAL MESSAGES (FIXED ORDER)
    // =========================
    const messages = [
      longContext,
      ...prompt,
      ...history,
      {
        role: "user",
        content: message
      }
    ];

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
    // RESPONSE
    // =========================
    const reply =
      data?.choices?.[0]?.message?.content ||
      "Aucune réponse.";

    await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .add({
        role: "assistant",
        text: reply,
        timestamp: Date.now()
      });

    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
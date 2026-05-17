import { buildPrompt } from "../lib/prompt.js";
import { getMemory, saveMemory } from "./memory.js";

const MODEL = "gpt-4o-mini";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { message, userId = "firmin" } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message vide" });
    }

    // 1. charger mémoire
    const memory = getMemory(userId);

    // 2. construire prompt
    const messages = buildPrompt(memory, message);

    // 3. appel GPT
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages
      })
    });

    const data = await response.json();

    const reply = data?.choices?.[0]?.message?.content;

    // 4. mise à jour mémoire simple (optionnel)
    saveMemory(userId, {
      lastMessage: message,
      lastReply: reply
    });

    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
}
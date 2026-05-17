import { buildPrompt } from "../lib/prompt.js";
import { getMemory, updateMemory } from "./memory.js";
import { extractMemory } from "./extractor.js";

export default async function handler(req, res) {
  try {
    const { message, userId = "firmin" } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message vide" });
    }

    // 🧠 1. lire mémoire actuelle
    const memory = getMemory(userId);

    // 🧠 2. extraction automatique (NEW)
    const newInfo = await extractMemory(message);

    // 🧠 3. update mémoire intelligente
    if (Object.keys(newInfo).length > 0) {
      updateMemory(userId, newInfo);
    }

    const updatedMemory = getMemory(userId);

    // 🧠 4. prompt dynamique
    const messages = buildPrompt(updatedMemory, message);

    // 🤖 5. GPT call
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages
      })
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;

    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
}
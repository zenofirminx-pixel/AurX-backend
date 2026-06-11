import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { parse } from "cookie";

export const config = { maxDuration: 60 };

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

// 👉 ERREUR HUMAINE
function sendError(res, msg) {
  res.write(
    `data: ${JSON.stringify({
      error: {
        icon: "⚠️",
        message: msg
      }
    })}\n\n`
  );
}

export default async function handler(req, res) {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // 🔐 USER
    const cookies = parse(req.headers.cookie || "");
    let userId = "guest_global";

    if (cookies.aurx_session) {
      try {
        const user = JSON.parse(Buffer.from(cookies.aurx_session, "base64").toString());
        userId = user.sid || user.id || "guest_global";
      } catch {}
    }

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body || {};

    const message = body.message?.trim();
    const convId = body.convId;

    if (!message || !convId) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const now = Date.now();

    // 🧠 MEMORY SAVE
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length) {
        await saveMemory(db, userId, memories);
      }
    } catch (e) {
      console.error("Memory error:", e);
    }

    // 📜 HISTORY
    let history = [];
    try {
      const snap = await db
        .collection("users")
        .doc(userId)
        .collection("messages")
        .where("convId", "==", convId)
        .orderBy("timestamp", "desc")
        .limit(20)
        .get();

      const docs = snap.docs.reverse();

      docs.forEach(d => {
        history.push({
          role: d.data().role,
          content: d.data().text
        });
      });
    } catch (e) {
      console.error("History error:", e);
    }

    history.push({ role: "user", content: message });

    // 🤖 PROMPT
    const systemPrompt = buildPrompt();

    const messages = [
      { role: "system", content: systemPrompt },
      ...history
    ];

    // 🌊 SSE HEADERS (IMPORTANT)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullReply = "";

    let response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY_1}`,
          "HTTP-Referer": "https://aurx.vercel.app",
          "X-Title": "AurX"
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages,
          stream: true,
          temperature: 0.7
        })
      });
    } catch (e) {
      sendError(res, "Impossible de contacter l’IA. Vérifie ta connexion.");
      return res.end();
    }

    if (!response?.ok || !response.body) {
      sendError(res, "Le serveur IA ne répond pas correctement.");
      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const data = line.replace("data: ", "");

          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;

            if (content) {
              fullReply += content;
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch {}
        }
      }
    } catch (e) {
      console.error("Stream error:", e);
      sendError(res, "Connexion interrompue pendant la réponse.");
    }

    // 🔥 END STREAM PROPERLY
    res.write(`data: [DONE]\n\n`);
    res.end();

    // 💾 SAVE SAFE
    try {
      await db.collection("users").doc(userId).collection("messages").add({
        role: "assistant",
        text: fullReply,
        timestamp: Date.now(),
        convId
      });
    } catch (e) {
      console.error("Save error:", e);
    }

  } catch (err) {
    console.error("Chat crash:", err);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Serveur interne",
        details: err.message
      });
    }
  }
}
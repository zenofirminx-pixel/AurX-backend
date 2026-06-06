import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { parse } from 'cookie';

// =========================
// CORS
// =========================
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
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

    if (req.method!== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // =========================
    // USER ID - LIT LE COOKIE
    // =========================
    const cookies = parse(req.headers.cookie || '');
    const session = cookies.aurx_session;

    let userId = "guest_" + (req.headers["x-forwarded-for"]?.split(',')[0] || "local");

    if (session) {
      try {
        const user = JSON.parse(Buffer.from(session, 'base64').toString());
        userId = user.sid || user.id;
      } catch (e) {
        console.error('Session invalide:', e);
      }
    }

    // =========================
    // BODY
    // =========================
    let body = {};
    try {
      body = typeof req.body === "string"? JSON.parse(req.body) : req.body || {};
    } catch {}

    const message = body.message?.trim();
    const convId = body.convId || Date.now().toString();
    const title = body.title || message?.slice(0, 40);
    const saveOnly = body.saveOnly || false;

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    const now = Date.now();

    // =========================
    // MEMORY EXTRACTION
    // =========================
    const memories = extractMemory(message);
    await saveMemory(db, userId, memories);

    // =========================
    // STRUCTURE CONVERSATIONS POUR L'UI
    // =========================
    const convRef = db.collection("conversations").doc(userId);
    const convSnap = await convRef.get();

    let conversations = convSnap.exists? convSnap.data().conversations || [] : [];
    let currentConv = conversations.find(c => c.id === convId);

    if (!currentConv) {
      currentConv = {
        id: convId,
        title: title,
        messages: [],
        date: now
      };
      conversations.unshift(currentConv);
    }

    // Ajoute le message user dans la conv UI
    currentConv.messages.push({
      text: message,
      type: 'user',
      timestamp: now
    });

    // =========================
    // SAVE MESSAGE À PLAT POUR CONTEXTE IA
    // =========================
    await db
    .collection("users")
    .doc(userId)
    .collection("messages")
    .add({
        role: "user",
        text: message,
        timestamp: now,
        convId: convId // ← lie le message à la conv
      });

    // Si saveOnly, on save la conv et on return
    if (saveOnly) {
      await convRef.set({ conversations: conversations.slice(0, 50) });
      return res.status(200).json({ ok: true, convId: currentConv.id });
    }

    // =========================
    // HISTORIQUE POUR IA - ON PREND LES 20 DERNIERS MESSAGES TOUS CONV CONFONDUES
    // =========================
    const msgSnapshot = await db
    .collection("users")
    .doc(userId)
    .collection("messages")
    .orderBy("timestamp", "desc")
    .limit(20)
    .get();

    const history = [];
    msgSnapshot.forEach(doc => {
      const data = doc.data();
      history.unshift({
        role: data.role,
        content: data.text
      });
    });

    const messages = [
    ...history,
    ...buildPrompt(message)
    ];

    const apiKey = process.env.OPENAI_API_KEY_1;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing API key" });
    }

    // =========================
    // OPENROUTER
    // =========================
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://aurx.vercel.app",
          "X-Title": "AurX"
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages,
          stream: false
        })
      }
    );

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "Invalid JSON from OpenRouter",
        raw: text
      });
    }

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "Je n’ai pas pu répondre.";
    const replyTime = Date.now();

    // Ajoute la réponse IA dans la conv UI
    currentConv.messages.push({
      text: reply,
      type: 'bot',
      timestamp: replyTime
    });

    // Update title si c'est le premier échange
    if (currentConv.messages.length === 2) {
      currentConv.title = message.slice(0, 40);
    }

    // Save la conv UI
    await convRef.set({ conversations: conversations.slice(0, 50) });

    // Save le message assistant à plat pour contexte futur
    await db
    .collection("users")
    .doc(userId)
    .collection("messages")
    .add({
        role: "assistant",
        text: reply,
        timestamp: replyTime,
        convId: convId
      });

    return res.status(200).json({
      reply,
      convId: currentConv.id,
      timestamp: replyTime
    });

  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
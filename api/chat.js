import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { parse } from "cookie";

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

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // =========================
    // SESSION
    // =========================
    const cookies = parse(req.headers.cookie || "");
    const session = cookies.aurx_session;

    let userId = null;
    let isLoggedIn = false;

    if (session) {
      try {
        const user = JSON.parse(Buffer.from(session, "base64").toString());
        userId = user.google_id;
        if (userId) isLoggedIn = true;
      } catch (e) {
        console.error("Session invalide:", e);
      }
    }

    // =========================
    // BODY
    // =========================
    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
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
    // MEMORY (USER)
    // =========================
    if (isLoggedIn) {
      const memories = extractMemory(message);
      await saveMemory(db, userId, memories);

      const convRef = db.collection("conversations").doc(userId);
      const convSnap = await convRef.get();

      let conversations = convSnap.exists ? convSnap.data().conversations || [] : [];
      let currentConv = conversations.find(c => c.id === convId);

      if (!currentConv) {
        currentConv = {
          id: convId,
          title,
          messages: [],
          date: now,
          updatedAt: now
        };
        conversations.unshift(currentConv);
      }

      currentConv.messages.push({
        content: message,
        role: "user",
        timestamp: now
      });

      await db
        .collection("users")
        .doc(userId)
        .collection("messages")
        .add({
          role: "user",
          content: message,
          timestamp: now,
          convId
        });

      if (saveOnly) {
        await convRef.set({ conversations: conversations.slice(0, 50) });
        return res.status(200).json({ ok: true, convId });
      }
    }

    // =========================
    // HISTORY (IA MEMORY)
    // =========================
    let history = [];

    if (isLoggedIn) {
      const msgSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("messages")
        .orderBy("timestamp", "asc")
        .limit(20)
        .get();

      msgSnapshot.forEach(doc => {
        const data = doc.data();
        history.push({
          role: data.role,
          content: data.content
        });
      });
    } else {
      history = body.history || [];
    }

    // =========================
    // SYSTEM PROMPT (IMPORTANT)
    // =========================
    const systemPrompt = buildPrompt();

    // =========================
    // FINAL MESSAGES (FIX IMPORTANT)
    // =========================
    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      ...history,
      {
        role: "user",
        content: message
      }
    ];

    // =========================
    // OPENROUTER
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing API key" });
    }

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

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "Je n’ai pas pu répondre.";
    const replyTime = Date.now();

    // =========================
    // SAVE RESPONSE
    // =========================
    if (isLoggedIn) {
      const convRef = db.collection("conversations").doc(userId);
      const convSnap = await convRef.get();

      let conversations = convSnap.exists ? convSnap.data().conversations || [] : [];
      let currentConv = conversations.find(c => c.id === convId);

      if (currentConv) {
        currentConv.messages.push({
          content: reply,
          role: "assistant",
          timestamp: replyTime
        });

        currentConv.updatedAt = replyTime;

        const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
        conversations = conversations.filter(c => (c.updatedAt || c.date) > fifteenDaysAgo);

        if (conversations.length > 50) {
          conversations = conversations
            .sort((a, b) => (b.updatedAt || b.date) - (a.updatedAt || a.date))
            .slice(0, 50);
        }

        await convRef.set({ conversations });

        await db
          .collection("users")
          .doc(userId)
          .collection("messages")
          .add({
            role: "assistant",
            content: reply,
            timestamp: replyTime,
            convId
          });
      }
    }

    return res.status(200).json({
      reply,
      convId,
      timestamp: replyTime,
      isLoggedIn
    });

  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
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
    // USER ID
    // =========================
    const cookies = parse(req.headers.cookie || "");
    const session = cookies.aurx_session;

    let userId = "guest_" + (req.headers["x-forwarded-for"]?.split(",")[0] || "local");

    if (session) {
      try {
        const user = JSON.parse(Buffer.from(session, "base64").toString());
        userId = user.sid || user.id;
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

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    const now = Date.now();

    // =========================
    // MEMORY EXTRACTION (LONG TERM)
    // =========================
    const memories = extractMemory(message);
    await saveMemory(db, userId, memories);

    // =========================
    // LOAD CONVERSATION
    // =========================
    const convRef = db.collection("conversations").doc(userId);
    const convSnap = await convRef.get();

    let conversations = convSnap.exists ? convSnap.data().conversations || [] : [];

    let currentConv = conversations.find(c => c.id === convId);

    if (!currentConv) {
      currentConv = {
        id: convId,
        title: message.slice(0, 40),
        messages: [],
        date: now,
        updatedAt: now
      };
      conversations.unshift(currentConv);
    }

    currentConv.messages.push({
      text: message,
      type: "user",
      timestamp: now
    });

    // =========================
    // SAVE MESSAGE (IA CONTEXT)
    // =========================
    await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .add({
        role: "user",
        text: message,
        timestamp: now,
        convId: convId
      });

    // =========================
    // CLEAN HISTORY (IMPORTANT FIX)
    // =========================
    const msgSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .where("convId", "==", convId)
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

    // =========================
    // MEMORY INJECTION (IMPORTANT FIX)
    // =========================
    const memorySnap = await db
      .collection("users")
      .doc(userId)
      .collection("memory")
      .get();

    let memoryText = "";
    memorySnap.forEach(doc => {
      memoryText += doc.data().value + "\n";
    });

    const messages = [
      {
        role: "system",
        content: memoryText
      },
      ...history,
      ...buildPrompt(message)
    ];

    // =========================
    // OPENROUTER CALL
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing API key" });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "Je n’ai pas pu répondre.";
    const replyTime = Date.now();

    // =========================
    // SAVE BOT MESSAGE
    // =========================
    currentConv.messages.push({
      text: reply,
      type: "bot",
      timestamp: replyTime
    });

    currentConv.updatedAt = replyTime;

    await convRef.set({ conversations });

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
    console.error("Chat error:", err);
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
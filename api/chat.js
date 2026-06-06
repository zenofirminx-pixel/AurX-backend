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
// INIT SAFE
// =========================
async function ensureUserStructure(db, userId) {
  const userRef = db.collection("users").doc(userId);
  const convRef = db.collection("conversations").doc(userId);

  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    await userRef.set({ createdAt: Date.now() });
  }

  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    await convRef.set({ conversations: [] });
  }
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

    let userId =
      "guest_" + (req.headers["x-forwarded-for"]?.split(",")[0] || "local");

    if (session) {
      try {
        const user = JSON.parse(Buffer.from(session, "base64").toString());
        userId = user.sid || user.id;
      } catch {}
    }

    // =========================
    // BODY
    // =========================
    let body = {};
    try {
      body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body || {};
    } catch {}

    const message = body.message?.trim();
    const convId = body.convId || Date.now().toString();

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    const now = Date.now();

    await ensureUserStructure(db, userId);

    // =========================
    // MEMORY SAVE
    // =========================
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories)) {
        await saveMemory(db, userId, memories);
      }
    } catch {}

    // =========================
    // CONVERSATIONS
    // =========================
    const convRef = db.collection("conversations").doc(userId);
    const convSnap = await convRef.get();

    let conversations = convSnap.exists
      ? convSnap.data().conversations || []
      : [];

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

    await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .add({
        role: "user",
        text: message,
        timestamp: now,
        convId
      });

    // =========================
    // HISTORY
    // =========================
    let history = [];

    try {
      const snap = await db
        .collection("users")
        .doc(userId)
        .collection("messages")
        .where("convId", "==", convId)
        .limit(20)
        .get();

      snap.forEach(doc => {
        const d = doc.data();
        history.unshift({
          role: d.role,
          content: d.text
        });
      });
    } catch {}

    // =========================
    // MEMORY LOAD
    // =========================
    let memoryText = "";
    let userName = null;

    try {
      const memSnap = await db
        .collection("users")
        .doc(userId)
        .collection("memory")
        .get();

      const identity = [];
      const facts = [];
      const preferences = [];
      const style = [];

      memSnap.forEach(doc => {
        const d = doc.data();

        if (d.type === "identity" && d.key === "name") {
          userName = d.value;
        }

        switch (d.type) {
          case "identity":
            identity.push(d.value);
            break;
          case "preference":
            preferences.push(d.value);
            break;
          case "style":
            style.push(d.value);
            break;
          default:
            facts.push(d.value);
        }
      });

      memoryText = `
[IDENTITY]
${identity.map(v => "- " + v).join("\n")}

[FACTS]
${facts.map(v => "- " + v).join("\n")}

[PREFERENCES]
${preferences.map(v => "- " + v).join("\n")}

[STYLE]
${style.map(v => "- " + v).join("\n")}
      `.trim();
    } catch {}

    // =========================
    // 🔥 SYSTEM PROMPT BOOST (IMPORTANT FIX)
    // =========================
    const systemBoost = userName
      ? `User name (important): ${userName}. Use it naturally sometimes, not every sentence.`
      : "";

    // =========================
    // PROMPT BUILD
    // =========================
    const messages = [
      {
        role: "system",
        content:
          `${systemBoost}\n\n${memoryText || "You are AurX chatbot."}`.trim()
      },
      ...history,
      ...buildPrompt(message)
    ];

    // =========================
    // OPENROUTER
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

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

    const data = await response.json().catch(() => ({}));

    const reply =
      data?.choices?.[0]?.message?.content ||
      "Je n’ai pas pu répondre.";

    const replyTime = Date.now();

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
        convId
      });

    return res.status(200).json({
      reply,
      convId
    });

  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
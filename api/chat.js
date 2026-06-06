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
// INIT SAFE (NO RESET)
// =========================
async function ensureUserStructure(db, userId) {
  if (!userId) return;

  const userRef = db.collection("users").doc(userId);
  const convRef = db.collection("conversations").doc(userId);

  await userRef.set(
    { createdAt: Date.now() },
    { merge: true }
  );

  await convRef.set(
    { conversations: [] },
    { merge: true }
  );
}

// =========================
// CLEANUP 14 DAYS (ONLY MSG + CONV)
// =========================
async function cleanupOldData(db, userId) {
  const limit = 14 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const snap = await db
   .collection("users")
   .doc(userId)
   .collection("messages")
   .get();

  const batch = db.batch();
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.timestamp && now - data.timestamp > limit) {
      batch.delete(doc.ref);
    }
  });
  await batch.commit();
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
    // USER ID (COOKIE ONLY)
    // =========================
    const cookies = parse(req.headers.cookie || "");
    const session = cookies.aurx_session;

    let userId = "guest_global";

    if (session) {
      try {
        const user = JSON.parse(Buffer.from(session, "base64").toString());
        userId = user.sid || user.id || "guest_global";
      } catch {
        userId = "guest_global";
      }
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

    // =========================
    // INIT USER
    // =========================
    await ensureUserStructure(db, userId);

    // =========================
    // MEMORY SAVE
    // =========================
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length > 0) {
        await saveMemory(db, userId, memories);
      }
    } catch (e) {
      console.error("Memory save error:", e);
    }

    // =========================
    // HISTORY - FIXED
    // =========================
    let history = [];

    try {
      const snap = await db
       .collection("users")
       .doc(userId)
       .collection("messages")
       .where("convId", "==", convId)
       .orderBy("timestamp", "desc")
       .limit(19) // 19 + message actuel = 20
       .get();

      // Reverse pour ordre chrono : plus ancien → plus récent
      snap.docs.reverse().forEach(doc => {
        const d = doc.data();
        history.push({
          role: d.role,
          content: d.text
        });
      });
    } catch (e) {
      console.error("History load error:", e);
    }

    // Ajoute le message actuel à la fin
    history.push({ role: "user", content: message });

    // =========================
    // MEMORY LOAD - RANKED
    // =========================
    let memoryText = "";
    let userName = null;

    try {
      const memSnap = await db
       .collection("users")
       .doc(userId)
       .collection("memory")
       .orderBy("timestamp", "desc")
       .limit(50)
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

      // Rank memory : prend les + récents + ceux pertinents au message
      const keywords = message.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const relevantFacts = facts.filter(v =>
        keywords.some(k => v.toLowerCase().includes(k))
      ).slice(0, 5);

      const memoryParts = [];
      if (identity.length) memoryParts.push(`[IDENTITY]\n${identity.slice(0, 3).map(v => "- " + v).join("\n")}`);
      if (relevantFacts.length) memoryParts.push(`[RELEVANT FACTS]\n${relevantFacts.map(v => "- " + v).join("\n")}`);
      if (preferences.length) memoryParts.push(`[PREFERENCES]\n${preferences.slice(0, 5).map(v => "- " + v).join("\n")}`);
      if (style.length) memoryParts.push(`[STYLE]\n${style.slice(0, 3).map(v => "- " + v).join("\n")}`);

      memoryText = memoryParts.join("\n\n");
    } catch (e) {
      console.error("Memory load error:", e);
    }

    // =========================
    // SYSTEM BOOST
    // =========================
    const systemBoost = userName
     ? `User name: ${userName}. Use it naturally sometimes. Never say you remember their name every message.`
      : "";

    // =========================
    // SAVE MESSAGE USER - AVANT L'APPEL API
    // =========================
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
    // CONVERSATIONS UPDATE
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

    // =========================
    // PROMPT - FIXED
    // =========================
    const systemPrompt = buildPrompt(); // buildPrompt ne doit plus prendre message en param

    const messages = [
      {
        role: "system",
        content: `${systemBoost}\n\n${memoryText || "You are AurX, a helpful AI assistant."}\n\n${systemPrompt}`.trim()
      },
     ...history // history contient déjà le message actuel
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
          stream: false,
          temperature: 0.7
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

    // Garde que les 50 convs les + récentes
    if (conversations.length > 50) {
      conversations = conversations.slice(0, 50);
    }

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

    // =========================
    // CLEANUP (14 DAYS ONLY MSG + CONV)
    // =========================
    cleanupOldData(db, userId).catch(e => console.error("Cleanup error:", e));

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
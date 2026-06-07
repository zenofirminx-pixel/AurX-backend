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
  await userRef.set({ createdAt: Date.now() }, { merge: true });
  await convRef.set({ conversations: [] }, { merge: true });
}

// =========================
// CLEANUP 5 DAYS
// =========================
async function cleanupOldData(db, userId) {
  const limit = 5 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const msgSnap = await db
  .collection("users")
  .doc(userId)
  .collection("messages")
  .where("timestamp", "<", now - limit)
  .get();

  const msgBatch = db.batch();
  msgSnap.forEach((doc) => msgBatch.delete(doc.ref));
  await msgBatch.commit();

  const convRef = db.collection("conversations").doc(userId);
  const convSnap = await convRef.get();
  if (convSnap.exists) {
    const conversations = convSnap.data().conversations || [];
    const filtered = conversations.filter(c => {
      const lastUpdate = c.updatedAt || c.date || 0;
      return now - lastUpdate <= limit;
    });
    if (filtered.length!== conversations.length) {
      await convRef.set({ conversations: filtered });
    }
  }
}

// =========================
// HANDLER
// =========================
export default async function handler(req, res) {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method!== "POST") return res.status(405).json({ error: "Method not allowed" });

    // USER ID
    const cookies = parse(req.headers.cookie || "");
    const session = cookies.aurx_session;
    let userId = "guest_global";
    if (session) {
      try {
        const user = JSON.parse(Buffer.from(session, "base64").toString());
        userId = user.sid || user.id || "guest_global";
      } catch {}
    }

    // BODY
    let body = {};
    try {
      body = typeof req.body === "string"? JSON.parse(req.body) : req.body || {};
    } catch {}
    const message = body.message?.trim();
    const convId = body.convId || Date.now().toString();
    if (!message) return res.status(400).json({ error: "Missing message" });

    const now = Date.now();
    await ensureUserStructure(db, userId);

    // MEMORY SAVE
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length > 0) {
        await saveMemory(db, userId, memories);
      }
    } catch (e) {
      console.error("Memory save error:", e);
    }

    // =========================
    // HISTORY - FIX INDEX + DEBUG
    // =========================
    let history = [];
    try {
      // Si l'index existe pas, Firestore throw. On catch et fallback sans orderBy
      let snap;
      try {
        snap = await db
        .collection("users")
        .doc(userId)
        .collection("messages")
        .where("convId", "==", convId)
        .orderBy("timestamp", "desc")
        .limit(20)
        .get();
      } catch (indexErr) {
        console.warn("Index missing, fallback without orderBy:", indexErr.message);
        snap = await db
        .collection("users")
        .doc(userId)
        .collection("messages")
        .where("convId", "==", convId)
        .limit(20)
        .get();
      }

      // Tri manuel si orderBy a fail
      const docs = snap.docs.sort((a, b) => a.data().timestamp - b.data().timestamp);

      docs.forEach(doc => {
        const d = doc.data();
        history.push({
          role: d.role,
          content: d.text
        });
      });

      console.log(`[HISTORY] Loaded ${history.length} messages for convId ${convId}`);
    } catch (e) {
      console.error("History load error:", e);
    }

    history.push({ role: "user", content: message });

    // MEMORY LOAD
    let memoryText = "";
    let userName = null;
    try {
      const memSnap = await db
      .collection("users")
      .doc(userId)
      .collection("memory")
      .orderBy("timestamp", "desc")
      .limit(30)
      .get();

      const identity = [];
      const facts = [];
      const preferences = [];

      memSnap.forEach(doc => {
        const d = doc.data();
        if (d.type === "identity" && d.key === "name") userName = d.value;
        if (d.type === "identity") identity.push(d.value);
        else if (d.type === "preference") preferences.push(d.value);
        else facts.push(d.value);
      });

      const memoryParts = [];
      if (identity.length) memoryParts.push(`User: ${identity[0]}`);
      if (facts.length) memoryParts.push(`Facts: ${facts.slice(0, 3).join(", ")}`);
      if (preferences.length) memoryParts.push(`Likes: ${preferences.slice(0, 2).join(", ")}`);
      memoryText = memoryParts.join(" | ");
    } catch (e) {
      console.error("Memory load error:", e);
    }

    // SAVE USER MSG
    await db.collection("users").doc(userId).collection("messages").add({
      role: "user",
      text: message,
      timestamp: now,
      convId
    });

    // CONVERSATIONS
    const convRef = db.collection("conversations").doc(userId);
    const convSnap = await convRef.get();
    let conversations = convSnap.exists? convSnap.data().conversations || [] : [];
    let currentConv = conversations.find(c => c.id === convId);
    if (!currentConv) {
      currentConv = { id: convId, title: message.slice(0, 40), messages: [], date: now, updatedAt: now };
      conversations.unshift(currentConv);
    }
    currentConv.messages.push({ text: message, type: "user", timestamp: now });

    // PROMPT
    const systemPrompt = buildPrompt();
    const messages = [
      {
        role: "system",
        content: `You are AurX. ${memoryText? `Context: ${memoryText}` : ""}\n\n${systemPrompt}`.trim()
      },
    ...history
    ];

    console.log("[GPT] Sending", messages.length, "messages. Last 2:", messages.slice(-2));

    // OPENROUTER
    const apiKey = process.env.OPENAI_API_KEY_1;
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
        stream: false,
        temperature: 0.7
      })
    });

    const data = await response.json().catch(() => ({}));
    const reply = data?.choices?.[0]?.message?.content || "Je n’ai pas pu répondre.";
    const replyTime = Date.now();

    currentConv.messages.push({ text: reply, type: "bot", timestamp: replyTime });
    currentConv.updatedAt = replyTime;
    if (conversations.length > 30) conversations = conversations.slice(0, 30);
    await convRef.set({ conversations });

    await db.collection("users").doc(userId).collection("messages").add({
      role: "assistant",
      text: reply,
      timestamp: replyTime,
      convId
    });

    cleanupOldData(db, userId).catch(e => console.error("Cleanup error:", e));

    return res.status(200).json({ reply, convId });

  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({ error: "Server crash", details: err.message });
  }
}
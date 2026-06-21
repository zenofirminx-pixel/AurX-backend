// api/chat.js
import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { parse, serialize } from "cookie";
import { randomUUID } from "crypto";

export const config = { maxDuration: 60 };

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function sendError(res, msg) {
  try {
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch {}
}

function write(res, obj) {
  try {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  } catch {}
}

function closeStream(res) {
  try {
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch {}
}

function getUserIdFromCookies(req, res) {
  const cookies = parse(req.headers.cookie || "");
  let userId = null;
  let isGuest = false;

  // 1. User connecté via Google
  if (cookies.aurx_session) {
    try {
      const user = JSON.parse(Buffer.from(cookies.aurx_session, "base64").toString());
      userId = user.id || user.sid || user.email;
    } catch (err) {
      console.error("Erreur décodage session cookie :", err);
    }
  }

  // 2. Guest avec ID existant
  if (!userId) {
    isGuest = true;
    if (cookies.aurx_guest_id) {
      userId = cookies.aurx_guest_id;
    } else {
      // Nouveau guest : on génère + set cookie
      userId = `guest_${randomUUID()}`;
      res.setHeader(
        "Set-Cookie",
        serialize("aurx_guest_id", userId, {
          path: "/",
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 60 * 60 * 24 * 365, // 1 an
        })
      );
    }
  }

  return { userId, isGuest };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method!== "POST") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  try {
    const body = typeof req.body === "string"? JSON.parse(req.body) : req.body || {};
    const message = body.message?.trim();
    const convId = body.convId;

    if (!message) return sendError(res, "Missing message");
    if (!convId) return sendError(res, "Missing convId");

    const { userId } = getUserIdFromCookies(req, res);

    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;
    const messagesRef = db.collection("users").doc(userId).collection("messages");

    // Nettoyage messages > 10min
    try {
      const oldMessagesSnap = await messagesRef
       .where("convId", "==", convId)
       .where("timestamp", "<", tenMinutesAgo)
       .get();

      if (!oldMessagesSnap.empty) {
        const batch = db.batch();
        oldMessagesSnap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      }
    } catch (err) {
      console.error("Erreur nettoyage messages :", err);
    }

    // Save message user
    await messagesRef.add({
      role: "user",
      text: message,
      timestamp: now,
      convId,
    });

    // Extract + save memory
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length > 0) {
        await saveMemory(db, userId, memories);
      }
    } catch {}

    // Récup historique
    let history = [];
    try {
      const snap = await messagesRef.where("convId", "==", convId).get();
      history = snap.docs
       .map((d) => d.data())
       .sort((a, b) => a.timestamp - b.timestamp)
       .map((m) => ({ role: m.role, content: m.text }));

      if (history.length > 0 && history[history.length - 1].content === message) {
        history.pop();
      }
      history = history.slice(-19);
    } catch {}

    // Charge mémoire profonde
    let name = null;
    let facts = [];
    let prefs = [];

    try {
      const memSnap = await db.collection("users").doc(userId).collection("memory").get();
      memSnap.forEach((doc) => {
        const d = doc.data();
        if (d.type === "identity" && d.key === "name") name = d.value;
        else if (d.type === "preference") prefs.push(d.value);
        else facts.push(d.value);
      });
    } catch {}

    // ===== PROMPT DYNAMIQUE VIA buildPrompt =====
    const systemPrompt = buildPrompt({ name, facts, prefs });

    const messages = [
      { role: "system", content: systemPrompt },
     ...history,
      { role: "user", content: message }
    ];

    // APPEL OPENROUTER
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY_1}`,
        "HTTP-Referer": "https://aurx.vercel.app",
        "X-Title": "AurX",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages,
        stream: true,
        temperature: 0.7,
      }),
    });

    if (!response.ok ||!response.body) return sendError(res, "AI service error");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let full = "";
    let buffer = "";
    let got = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            got = true;
            full += content;
            write(res, { content });
          }
        } catch {}
      }
    }

    if (!got) return sendError(res, "Empty response from AI");

    // Save réponse assistant
    await messagesRef.add({
      role: "assistant",
      text: full,
      timestamp: Date.now(),
      convId,
    });

    closeStream(res);
  } catch (err) {
    console.error(err);
    sendError(res, "Server error");
  }
}
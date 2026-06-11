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

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // SSE HEADERS (IMPORTANT Vercel)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    const message = body.message?.trim();
    const convId = body.convId;

    if (!message) return sendError(res, "Missing message");
    if (!convId) return sendError(res, "Missing convId");

    // USER ID
    const cookies = parse(req.headers.cookie || "");
    let userId = "guest_global";

    if (cookies.aurx_session) {
      try {
        const user = JSON.parse(
          Buffer.from(cookies.aurx_session, "base64").toString()
        );
        userId = user.sid || user.id || "guest_global";
      } catch {}
    }

    const now = Date.now();

    // SAVE USER MESSAGE
    await db.collection("users").doc(userId).collection("messages").add({
      role: "user",
      text: message,
      timestamp: now,
      convId,
    });

    // MEMORY EXTRACTION
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length > 0) {
        await saveMemory(db, userId, memories);
      }
    } catch {}

    // HISTORY (safe sort client-side)
    let history = [];
    try {
      const snap = await db
        .collection("users")
        .doc(userId)
        .collection("messages")
        .where("convId", "==", convId)
        .get();

      history = snap.docs
        .map((d) => d.data())
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-20)
        .map((m) => ({
          role: m.role,
          content: m.text,
        }));
    } catch {}

    // MEMORY LOAD
    let name = null;
    let facts = [];
    let prefs = [];

    try {
      const memSnap = await db
        .collection("users")
        .doc(userId)
        .collection("memory")
        .get();

      memSnap.forEach((doc) => {
        const d = doc.data();

        if (d.type === "identity" && d.key === "name") {
          name = d.value;
        } else if (d.type === "preference") {
          prefs.push(d.value);
        } else {
          facts.push(d.value);
        }
      });
    } catch {}

    // 🔥 BUILD PROMPT (CORRECT INJECTION)
    let basePrompt = "";
    try {
      basePrompt = String(buildPrompt() || "");
    } catch {
      basePrompt = "Tu es AurX, un assistant IA utile et précis.";
    }

    let memoryBlock = "";

    if (name) {
      memoryBlock += `Nom utilisateur: ${name}\n`;
      memoryBlock += `IMPORTANT: utilise son nom naturellement.\n`;
    }

    if (facts.length) {
      memoryBlock += `Faits connus: ${facts.slice(0, 5).join(", ")}\n`;
    }

    if (prefs.length) {
      memoryBlock += `Préférences: ${prefs.slice(0, 5).join(", ")}\n`;
    }

    const systemPrompt = memoryBlock
      ? `${memoryBlock}\n---\n${basePrompt}`
      : basePrompt;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];

    // OPENROUTER
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
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
      }
    );

    if (!response.ok || !response.body) {
      return sendError(res, "AI service error");
    }

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

    if (!got) {
      return sendError(res, "Empty response from AI");
    }

    // SAVE BOT MESSAGE
    await db.collection("users").doc(userId).collection("messages").add({
      role: "assistant",
      text: full,
      timestamp: Date.now(),
      convId,
    });

    write(res, "[DONE]");
    res.end();
  } catch (err) {
    console.error(err);
    sendError(res, "Server error");
  }
}
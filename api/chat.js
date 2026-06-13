import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { parse, serialize } from "cookie";
import { randomUUID } from "crypto";
import { WebBrain } from "../core/webBrain.js";

export const config = { maxDuration: 60 };

// ===== PROMPT DE BASE =====
const BASE_PROMPT = `
# COMMUNICATION STYLE
Utilise un style naturel, fluide et agréable à lire.
Reste direct, précis et pertinent.
Réponds uniquement à la question posée.
Ne reformule pas inutilement la question de l'utilisateur.
Évite les répétitions et les phrases inutiles.

# SAFETY / INTERNAL INFORMATION
Ne mentionne jamais tes limitations techniques.
Nous sommes en 2026.
Si on te demande ton fonctionnement, dis que tu es un assistant évolutif mis à jour.

# CONVERSATION RULES
Sois naturel, fluide, intelligent.
Pas de phrases de clôture inutiles.

# MEMORY RULES
Tu peux utiliser la mémoire utilisateur si disponible.

# IDENTITY
Tu es AurX, assistant intelligent créé par un développeur congolais.
`;
// ===== FIN PROMPT =====

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

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const message = body.message?.trim();
    const convId = body.convId;

    if (!message) return sendError(res, "Missing message");
    if (!convId) return sendError(res, "Missing convId");

    // 🌐 WEBBRAIN
    let webData = null;
    try {
      webData = await WebBrain(message);
    } catch (err) {
      console.error("WebBrain error:", err);
      webData = { usedWeb: false };
    }

    const cookies = parse(req.headers.cookie || "");
    let userId = null;

    // 1. session user
    if (cookies.aurx_session) {
      try {
        const user = JSON.parse(
          Buffer.from(cookies.aurx_session, "base64").toString()
        );
        userId = user.id || user.sid || user.email;
      } catch {}
    }

    // 2. guest user
    if (!userId) {
      if (cookies.aurx_guest_id) {
        userId = cookies.aurx_guest_id;
      } else {
        userId = `guest_${randomUUID()}`;
        res.setHeader(
          "Set-Cookie",
          serialize("aurx_guest_id", userId, {
            path: "/",
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 60 * 60 * 24 * 365,
          })
        );
      }
    }

    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;

    const messagesRef = db
      .collection("users")
      .doc(userId)
      .collection("messages");

    // clean old messages
    try {
      const old = await messagesRef
        .where("convId", "==", convId)
        .where("timestamp", "<", tenMinutesAgo)
        .get();

      if (!old.empty) {
        const batch = db.batch();
        old.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch {}

    // save user message
    await messagesRef.add({
      role: "user",
      text: message,
      timestamp: now,
      convId,
    });

    // memory extraction
    try {
      const memories = extractMemory(message);
      if (memories?.length) {
        await saveMemory(db, userId, memories);
      }
    } catch {}

    // history
    let history = [];
    try {
      const snap = await messagesRef.where("convId", "==", convId).get();

      history = snap.docs
        .map((d) => d.data())
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((m) => ({
          role: m.role,
          content: m.text,
        }))
        .slice(-19);
    } catch {}

    // user memory
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

    // ===== PROMPT BUILD =====
    let instructions = `Instructions système importantes :\n${BASE_PROMPT}\n\n`;

    // 👤 CONTEXTE USER
    if (name || facts.length || prefs.length) {
      instructions += `[CONTEXTE UTILISATEUR]\n`;
      if (name) instructions += `- Nom : ${name}\n`;
      if (facts.length) instructions += `- Faits : ${facts.slice(0, 5).join(", ")}\n`;
      if (prefs.length) instructions += `- Préférences : ${prefs.slice(0, 5).join(", ")}\n`;
      instructions += `[FIN CONTEXTE UTILISATEUR]\n\n`;
    }

    // 🌐 CONTEXTE WEB
    if (webData?.usedWeb) {
      instructions += `[CONTEXTE WEB TEMPS RÉEL]\n`;

      const results = webData.results || [];

      results.slice(0, 6).forEach((r, i) => {
        instructions += `${i + 1}. ${r.title} - ${r.info || ""}\n`;
        if (r.link) instructions += `   source: ${r.link}\n`;
      });

      instructions += `[FIN CONTEXTE WEB]\n\n`;

      instructions += `
CONSIGNE IMPÉRATIVE :
- Tu as explicitement accès aux données récentes du web ci-dessus. Elles font partie de tes connaissances actuelles.
- Réponds à l'utilisateur en utilisant obligatoirement ces données si elles sont utiles.
- Agis naturellement : ne mentionne jamais de "moteur de recherche", de "liens" ou le fait que tu viens d'effectuer une recherche sur internet. Donne juste l'information comme si tu la savais.
`;
    }

    const messages = [
      {
        role: "system",
        content:
          instructions +
          `Reste strictement dans ton rôle d'assistant.`,
      },
      ...history,
    ];

    messages.push({
      role: "user",
      content: message,
    });

    // ===== OPENROUTER =====
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "HTTP-Referer": "https://aurx.vercel.app",
          "X-Title": "AurX",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages,
          stream: true,
          temperature: 0.3, // Température baissée pour un meilleur respect des consignes système
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

    if (!got) return sendError(res, "Empty response");

    // save assistant message
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

import { buildPrompt } from "../lib/buildPrompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { parse } from "cookie";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

async function ensureUserStructure(db, userId) {
  if (!userId) return;
  const userRef = db.collection("users").doc(userId);
  const convRef = db.collection("conversations").doc(userId);
  await userRef.set({ createdAt: Date.now() }, { merge: true });
  await convRef.set({ conversations: [] }, { merge: true });
}

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

    if (filtered.length !== conversations.length) {
      await convRef.set({ conversations: filtered });
    }
  }
}

export default async function handler(req, res) {
  try {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const cookies = parse(req.headers.cookie || "");
    const session = cookies.aurx_session;

    let userId = "guest_global";
    if (session) {
      try {
        const user = JSON.parse(Buffer.from(session, "base64").toString());
        userId = user.sid || user.id || "guest_global";
      } catch {}
    }

    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch {}

    const message = body.message?.trim();
    const convId = body.convId;

    if (!message) return res.status(400).json({ error: "Missing message" });
    if (!convId) return res.status(400).json({ error: "Missing convId" });

    const now = Date.now();

    // 1. Initialisation de la structure de l'utilisateur
    await ensureUserStructure(db, userId);

    // 2. Extraction et sauvegarde de la mémoire (en arrière-plan pour ne pas bloquer)
    try {
      const memories = extractMemory(message);
      if (Array.isArray(memories) && memories.length > 0) {
        await saveMemory(db, userId, memories);
      }
    } catch (e) {
      console.error("Memory save error:", e);
    }

    // 3. Récupération de l'historique
    let history = [];
    try {
      const snap = await db
        .collection("users")
        .doc(userId)
        .collection("messages")
        .where("convId", "==", convId)
        .limit(50)
        .get();

      const docs = snap.docs
        .map(doc => ({ ...doc.data(), id: doc.id }))
        .sort((a, b) => a.timestamp - b.timestamp);

      history = docs.map(d => ({
        role: d.role,
        content: d.text
      }));
    } catch (e) {
      console.error("History load error:", e);
    }

    history.push({ role: "user", content: message });

    // 4. Récupération des souvenirs (Mémoire à long terme)
    let memoryText = "";
    try {
      const memSnap = await db
        .collection("users")
        .doc(userId)
        .collection("memory")
        .limit(3).get(); // Directement limité à 3 pour optimiser

      const facts = [];
      memSnap.forEach(doc => {
        facts.push(doc.data().value);
      });

      memoryText = facts.join(" | ");
    } catch (e) {
      console.error("Memory load error:", e);
    }

    // Sauvegarde immédiate du message utilisateur en DB
    await db.collection("users").doc(userId).collection("messages").add({
      role: "user",
      text: message,
      timestamp: now,
      convId
    });

    // 5. Préparation du System Prompt (Correction : Intégration de la mémoire !)
    let systemPrompt = buildPrompt();
    if (memoryText) {
      systemPrompt += `\n\n[Context / User Memories]: ${memoryText}`;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...history
    ];

    console.log("[GPT] Streaming", messages.length);

    // 6. Configuration des Headers SSE pour le Streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

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
        stream: true,
        temperature: 0.7
      })
    });

    if (!response.ok || !response.body) {
      res.write(`data: ${JSON.stringify({ error: "OpenRouter error" })}\n\n`);
      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullReply = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const data = line.replace("data: ", "").trim();
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
    }

    // 7. TOUTES LES SAUVEGARDES DOIVENT ÊTRE FAITES AVANT RES.END()
    const replyTime = Date.now();

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

    // On pousse le message utilisateur et bot dans l'historique global de la conv
    if (!currentConv.messages.some(m => m.timestamp === now && m.type === "user")) {
      currentConv.messages.push({ text: message, type: "user", timestamp: now });
    }
    currentConv.messages.push({ text: fullReply, type: "bot", timestamp: replyTime });
    currentConv.updatedAt = replyTime;

    // Écritures finales synchronisées
    await convRef.set({ conversations });

    await db.collection("users").doc(userId).collection("messages").add({
      role: "assistant",
      text: fullReply,
      timestamp: replyTime,
      convId
    });

    // On lance le nettoyage et ENFIN on ferme la réponse HTTP
    await cleanupOldData(db, userId).catch(console.error);
    
    res.end();

  } catch (err) {
    console.error("Chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Server crash", details: err.message });
    }
  }
}

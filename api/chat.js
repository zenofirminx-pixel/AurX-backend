import prompt from "../lib/prompt.js";
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { parse } from "cookie";

// Edge Runtime = 0 buffering, streaming natif
export const runtime = 'edge';

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://aurx.vercel.app",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

async function ensureUserStructure(db, userId) {
  if (!userId) return;
  const userRef = db.collection("users").doc(userId);
  const convRef = db.collection("conversations").doc(userId);
  await Promise.all([
    userRef.set({ createdAt: Date.now() }, { merge: true }),
    convRef.set({ conversations: [] }, { merge: true })
  ]);
}

async function cleanupOldData(db, userId) {
  try {
    const limit = 5 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const msgSnap = await db.collection("users").doc(userId).collection("messages")
     .where("timestamp", "<", now - limit).limit(500).get();

    const batch = db.batch();
    msgSnap.forEach((doc) => batch.delete(doc.ref));
    if (!msgSnap.empty) await batch.commit();

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
  } catch (e) {
    console.error("Cleanup error:", e);
  }
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders() });
  }

  if (req.method!== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {...corsHeaders(), "Content-Type": "application/json" }
    });
  }

  // 1. Parse user + body
  const cookies = parse(req.headers.get("cookie") || "");
  const session = cookies.aurx_session;
  let userId = "guest_global";

  if (session) {
    try {
      const user = JSON.parse(Buffer.from(session, "base64").toString());
      userId = user.sid || user.id || "guest_global";
    } catch {}
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: {...corsHeaders(), "Content-Type": "application/json" }
    });
  }

  const message = body.message?.trim();
  const convId = body.convId;

  if (!message) {
    return new Response(JSON.stringify({ error: "Missing message" }), {
      status: 400,
      headers: {...corsHeaders(), "Content-Type": "application/json" }
    });
  }
  if (!convId) {
    return new Response(JSON.stringify({ error: "Missing convId" }), {
      status: 400,
      headers: {...corsHeaders(), "Content-Type": "application/json" }
    });
  }

  const now = Date.now();
  await ensureUserStructure(db, userId);

  // 2. MEMORY SAVE - non bloquant
  extractMemory(message).then(async (memories) => {
    if (Array.isArray(memories) && memories.length > 0) {
      await saveMemory(db, userId, memories).catch(e => console.error("Memory save error:", e));
    }
  });

  // 3. LOAD HISTORY
  let history = [];
  try {
    const snap = await db.collection("users").doc(userId).collection("messages")
     .where("convId", "==", convId)
     .orderBy("timestamp", "desc")
     .limit(50)
     .get();

    history = snap.docs
     .map(doc => ({ role: doc.data().role, content: doc.data().text }))
     .reverse(); // Plus ancien en premier

    console.log(`[HISTORY] ${userId} | ${convId} | ${history.length} msgs`);
  } catch (e) {
    console.error("History load error:", e);
  }

  history.push({ role: "user", content: message });

  // 4. LOAD MEMORY + BUILD SYSTEM PROMPT - MERGE EN 1 SEUL
  let userName = null;
  let fullSystemPrompt = prompt;

  try {
    const memSnap = await db.collection("users").doc(userId).collection("memory").limit(30).get();
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
    if (userName) memoryParts.push(`User's name: ${userName}`);
    if (identity.length) memoryParts.push(`Identity: ${identity.join(", ")}`);
    if (facts.length) memoryParts.push(`Facts: ${facts.slice(0, 3).join(", ")}`);
    if (preferences.length) memoryParts.push(`Preferences: ${preferences.slice(0, 2).join(", ")}`);

    if (memoryParts.length) {
      fullSystemPrompt += `\n\n--- User Context ---\n${memoryParts.join("\n")}`;
    }
  } catch (e) {
    console.error("Memory load error:", e);
  }

  // 5. SAVE USER MSG
  const saveUserMsg = db.collection("users").doc(userId).collection("messages").add({
    role: "user",
    text: message,
    timestamp: now,
    convId
  });

  // 6. UPDATE CONVERSATIONS
  const convRef = db.collection("conversations").doc(userId);
  const convSnap = await convRef.get();
  let conversations = convSnap.exists? convSnap.data().conversations || [] : [];
  let currentConv = conversations.find(c => c.id === convId);

  if (!currentConv) {
    currentConv = { id: convId, title: message.slice(0, 40), messages: [], date: now, updatedAt: now };
    conversations.unshift(currentConv);
  }
  currentConv.messages.push({ text: message, type: "user", timestamp: now });
  currentConv.updatedAt = now;

  // 7. BUILD FINAL MESSAGES - FILTRE LES ANCIENS SYSTEM
  const messages = [
    { role: "system", content: fullSystemPrompt },
  ...history.filter(m => m.role!== "system")
  ];

  console.log("[GPT] Streaming", messages.length, "messages");

  // 8. CALL OPENROUTER
  const apiKey = process.env.OPENAI_API_KEY_1;
  const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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

  if (!openRouterRes.ok) {
    const errText = await openRouterRes.text();
    console.error("OpenRouter error:", openRouterRes.status, errText);
    return new Response(JSON.stringify({ error: "AI service error" }), {
      status: 502,
      headers: {...corsHeaders(), "Content-Type": "application/json" }
    });
  }

  // 9. STREAM EN NDJSON - PAS DE BUFFER
  const encoder = new TextEncoder();
  let fullReply = '';

  const stream = new ReadableStream({
    async start(controller) {
      const reader = openRouterRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              controller.enqueue(encoder.encode(JSON.stringify({ done: true }) + '\n'));
              controller.close();

              // Save après stream fini
              await saveUserMsg;
              const replyTime = Date.now();
              currentConv.messages.push({ text: fullReply, type: "bot", timestamp: replyTime });
              if (conversations.length > 30) conversations = conversations.slice(0, 30);

              await Promise.all([
                convRef.set({ conversations }),
                db.collection("users").doc(userId).collection("messages").add({
                  role: "assistant",
                  text: fullReply,
                  timestamp: replyTime,
                  convId
                }),
                cleanupOldData(db, userId)
              ]);
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullReply += content;
                controller.enqueue(encoder.encode(JSON.stringify({ token: content }) + '\n'));
              }
            } catch {}
          }
        }
      } catch (e) {
        console.error('Stream error:', e);
        controller.enqueue(encoder.encode(JSON.stringify({ error: "Stream interrupted" }) + '\n'));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
    ...corsHeaders(),
      'Content-Type': 'application/x-ndjson',
      'X-Accel-Buffering': 'no',
      'Cache-Control': 'no-cache',
    }
  });
}
import { supabase } from "./supabase.js";

let buildPrompt = () => [];
let extractMemory = async () => ({});

try {
  const promptModule = await import("../lib/prompt.js");
  buildPrompt = promptModule.buildPrompt || buildPrompt;
  console.log("✅ prompt loaded");
} catch (e) {
  console.log("❌ prompt import error:", e);
}

try {
  const extractorModule = await import("./extractor.js");
  extractMemory = extractorModule.extractMemory || extractMemory;
  console.log("✅ extractor loaded");
} catch (e) {
  console.log("❌ extractor import error:", e);
}

export default async function handler(req, res) {
  try {

    // =========================
    // CORS
    // =========================
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    // =========================
    // BODY
    // =========================
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body || {};

    const message = body.message?.trim();
    const userid = (body.userid || body.userId)?.trim();

    if (!message || !userid) {
      return res.status(400).json({
        error: "Missing message or userid"
      });
    }

    console.log("🔥 REQUEST:", { userid, message });

    // =========================
    // LOAD MEMORY
    // =========================
    let { data: memory, error: memoryError } = await supabase
      .from("users")
      .select("*")
      .eq("userid", userid)
      .single();

    if (memoryError) {
      console.log("⚠️ MEMORY LOAD ERROR:", memoryError);
    }

    if (!memory) {
      memory = {
        userid,
        nom: null,
        langue: "fr",
        role: "user",
        notes: {},
        chat: []
      };
    }

    console.log("🧠 MEMORY:", memory);

    // =========================
    // EXTRACT MEMORY SAFE
    // =========================
    let extracted = {};

    try {
      const raw = await extractMemory(message);

      // 🔥 ON FILTRE UNIQUEMENT LES CHAMPS VALIDES
      extracted = {
        nom: raw?.nom ?? memory.nom,
        langue: raw?.langue ?? memory.langue,
        notes: raw?.notes ?? memory.notes
      };

      console.log("🧠 EXTRACTED:", extracted);

    } catch (e) {
      console.log("❌ EXTRACT ERROR:", e);
    }

    // =========================
    // UPDATE MEMORY
    // =========================
    try {
      const updatePayload = {
        ...memory,
        ...extracted
      };

      const { error: updateError } = await supabase
        .from("users")
        .upsert(updatePayload, {
          onConflict: "userid"
        });

      if (updateError) {
        console.log("❌ UPDATE ERROR:", updateError);
      }

    } catch (e) {
      console.log("❌ UPSERT CRASH:", e);
    }

    // =========================
    // RELOAD MEMORY
    // =========================
    const refreshed = await supabase
      .from("users")
      .select("*")
      .eq("userid", userid)
      .single();

    const userMemory = refreshed.data || memory;

    console.log("🧠 REFRESHED MEMORY:", userMemory);

    // =========================
    // BUILD PROMPT SAFE
    // =========================
    let messages = [];

    try {
      const base = buildPrompt(userMemory, message);

      const systemMsg = base?.[0] || {
        role: "system",
        content: "Tu es AurX."
      };

      const userMsg = base?.[1] || {
        role: "user",
        content: message
      };

      const history = Array.isArray(userMemory.chat)
        ? userMemory.chat.filter(
            m => m && m.role && m.content
          )
        : [];

      messages = [
        systemMsg,
        ...history.slice(-10),
        userMsg
      ];

    } catch (e) {
      console.log("❌ PROMPT ERROR:", e);

      messages = [
        {
          role: "system",
          content: "Tu es AurX."
        },
        {
          role: "user",
          content: message
        }
      ];
    }

    console.log("💬 MESSAGES:", messages);

    // =========================
    // API KEY
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY_1"
      });
    }

    // =========================
    // OPENROUTER
    // =========================
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://aur-x-pwa.vercel.app",
          "X-Title": "AurX"
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages
        })
      }
    );

    console.log("🌐 OPENROUTER STATUS:", response.status);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.log("❌ OPENROUTER ERROR:", data);

      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content || "";

    console.log("🤖 REPLY:", reply);

    // =========================
    // SAVE CHAT
    // =========================
    try {
      const newChat = [
        ...(userMemory.chat || []),
        {
          role: "user",
          content: message
        },
        {
          role: "assistant",
          content: reply
        }
      ].slice(-50);

      const { error: chatError } = await supabase
        .from("users")
        .update({
          chat: newChat
        })
        .eq("userid", userid);

      if (chatError) {
        console.log("❌ CHAT SAVE ERROR:", chatError);
      }

    } catch (e) {
      console.log("❌ SAVE CHAT CRASH:", e);
    }

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      reply
    });

  } catch (err) {
    console.log("💥 FATAL ERROR:", err);

    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
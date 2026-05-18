import { createClient } from "@supabase/supabase-js";
import { buildPrompt } from "../lib/prompt.js";
import { extractMemory } from "./extractor.js";

export default async function handler(req, res) {
  try {

    // =========================
    // CORS
    // =========================
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // =========================
    // BODY SAFE
    // =========================
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const message = body.message?.trim();
    const userid = (body.userid || body.userId)?.trim();

    if (!message || !userid) {
      return res.status(400).json({ error: "Missing message or userid" });
    }

    // =========================
    // SUPABASE INIT
    // =========================
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // =========================
    // READ MEMORY
    // =========================
    const { data: memoryData } = await supabase
      .from("users")
      .select("*")
      .eq("userid", userid)
      .single();

    let memory = memoryData || {
      userid,
      nom: null,
      langue: "fr",
      role: "user",
      notes: {},
      chat: []
    };

    // =========================
    // EXTRACT MEMORY SAFE
    // =========================
    try {
      const raw = await extractMemory(message);

      memory = {
        ...memory,
        nom: raw?.nom ?? memory.nom,
        langue: raw?.langue ?? memory.langue,
        notes: raw?.notes ?? memory.notes
      };

    } catch {}

    // =========================
    // UPDATE MEMORY
    // =========================
    await supabase
      .from("users")
      .upsert(memory, { onConflict: "userid" });

    // =========================
    // RELOAD MEMORY
    // =========================
    const { data: refreshed } = await supabase
      .from("users")
      .select("*")
      .eq("userid", userid)
      .single();

    memory = refreshed || memory;

    // =========================
    // BUILD PROMPT
    // =========================
    let messages;

    try {
      const base = buildPrompt(memory, message);

      const history = Array.isArray(memory.chat)
        ? memory.chat.slice(-10)
        : [];

      messages = [
        base?.[0] || {
          role: "system",
          content: "Tu es AurX."
        },
        ...history,
        base?.[1] || {
          role: "user",
          content: message
        }
      ];

    } catch {
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

    // =========================
    // OPENROUTER SAFE FETCH (FIX FETCH ERROR)
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

if (!apiKey) {
  return res.status(500).json({
    error: "NO_API_KEY"
  });
}

let reply = "";

try {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "user", content: message }
      ]
    })
  });

  const data = await r.json();
  reply = data?.choices?.[0]?.message?.content || "";

} catch (e) {
  return res.status(500).json({
    error: "FETCH_OPENROUTER_FAILED",
    details: e.message
  });
}

    // =========================
    // SAVE CHAT
    // =========================
    const newChat = [
      ...(memory.chat || []),
      { role: "user", content: message },
      { role: "assistant", content: reply }
    ].slice(-50);

    await supabase
      .from("users")
      .update({ chat: newChat })
      .eq("userid", userid);

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
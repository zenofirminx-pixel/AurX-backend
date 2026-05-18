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
    // BODY
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
    // SUPABASE
    // =========================
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

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
    // EXTRACT SAFE
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

    await supabase
      .from("users")
      .upsert(memory, { onConflict: "userid" });

    const { data: refreshed } = await supabase
      .from("users")
      .select("*")
      .eq("userid", userid)
      .single();

    memory = refreshed || memory;

    // =========================
    // PROMPT
    // =========================
    let messages;

    try {
      const base = buildPrompt(memory, message);

      messages = [
        base?.[0] || {
          role: "system",
          content: "Tu es AurX."
        },
        ...(Array.isArray(memory.chat) ? memory.chat.slice(-10) : []),
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
    // OPENROUTER FIXED (IMPORTANT)
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing API key" });
    }

    let response;
    try {
      response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages
          })
        }
      );
    } catch (err) {
      return res.status(500).json({
        error: "OPENROUTER_FETCH_FAILED",
        details: err.message
      });
    }

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(500).json({
        error: "OPENROUTER_ERROR",
        details: result
      });
    }

    const reply =
      result?.choices?.[0]?.message?.content || "";

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

    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({
      error: "SERVER_CRASH",
      details: err.message
    });
  }
}
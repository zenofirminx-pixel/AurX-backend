import { supabase } from "./supabase.js";
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
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const message = body.message?.trim();
    const userid = (body.userid || body.userId)?.trim();

    if (!message || !userid) {
      return res.status(400).json({
        error: "Missing message or userid"
      });
    }

    // =========================
    // READ MEMORY
    // =========================
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("userid", userid)
      .single();

    let memory = data || {
      userid,
      nom: null,
      langue: "fr",
      role: "user",
      notes: {},
      chat: []
    };

    // =========================
    // EXTRACT MEMORY
    // =========================
    try {
      const raw = await extractMemory(message);

      const extracted = {
        nom: raw?.nom ?? memory.nom,
        langue: raw?.langue ?? memory.langue,
        notes: raw?.notes ?? memory.notes
      };

      await supabase
        .from("users")
        .upsert(
          {
            ...memory,
            ...extracted
          },
          {
            onConflict: "userid"
          }
        );

    } catch {}

    // =========================
    // REFRESH MEMORY
    // =========================
    const refreshed = await supabase
      .from("users")
      .select("*")
      .eq("userid", userid)
      .single();

    memory = refreshed.data || memory;

    // =========================
    // BUILD PROMPT
    // =========================
    let messages = [];

    try {
      const base = buildPrompt(memory, message);

      const history = Array.isArray(memory.chat)
        ? memory.chat.filter(
            m => m && m.role && m.content
          )
        : [];

      messages = [
        base?.[0] || {
          role: "system",
          content: "Tu es AurX."
        },

        ...history.slice(-10),

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
    // OPENROUTER
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY_1"
      });
    }

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

    const result = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
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

      {
        role: "user",
        content: message
      },

      {
        role: "assistant",
        content: reply
      }

    ].slice(-50);

    await supabase
      .from("users")
      .update({
        chat: newChat
      })
      .eq("userid", userid);

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      reply
    });

  } catch (err) {

    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });

  }
}
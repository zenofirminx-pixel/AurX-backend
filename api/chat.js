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

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // =========================
    // BODY
    // =========================
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body || {};

    const message = body.message?.trim();
    const userid = (body.userid || body.userId)?.trim();

    if (!message || !userid) {
      return res.status(400).json({ error: "Missing message or userid" });
    }

    // =========================
    // 1. READ MEMORY
    // =========================
    const { data: memory } = await supabase
      .from("users")
      .select("*")
      .eq("userid", userid)
      .single();

    let userMemory = memory || {
      userid,
      nom: null,
      langue: "fr",
      role: "user",
      notes: {},
      chat: []
    };

    // =========================
    // 2. EXTRACT MEMORY
    // =========================
    try {
      const newInfo = await extractMemory(message);

      if (newInfo && Object.keys(newInfo).length > 0) {
        await supabase
          .from("users")
          .upsert({
            ...userMemory,
            ...newInfo
          });
      }
    } catch (e) {
      console.log("extract error:", e);
    }

    // reload memory
    const refreshed = await supabase
      .from("users")
      .select("*")
      .eq("userid", userid)
      .single();

    userMemory = refreshed.data || userMemory;

    // =========================
    // 3. BUILD PROMPT
    // =========================
    const base = buildPrompt(userMemory, message);

    const history = Array.isArray(userMemory.chat)
      ? userMemory.chat.slice(-10)
      : [];

    const messages = [
      base?.[0] || { role: "system", content: "Tu es AurX." },
      ...history,
      base?.[1] || { role: "user", content: message }
    ];

    // =========================
    // 4. OPENROUTER
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "";

    // =========================
    // 5. SAVE CHAT
    // =========================
    const newChat = [
      ...(userMemory.chat || []),
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
    console.log("FATAL ERROR:", err);

    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
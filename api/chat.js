let buildPrompt = () => [];
let getMemory = async () => ({});
let updateMemory = async () => {};
let extractMemory = async () => {};

try {
  const promptModule = await import("../lib/prompt.js");
  buildPrompt = promptModule.buildPrompt || buildPrompt;
} catch {}

try {
  const memoryModule = await import("./memory.js");
  getMemory = memoryModule.getMemory || getMemory;
  updateMemory = memoryModule.updateMemory || updateMemory;
} catch {}

try {
  const extractorModule = await import("./extractor.js");
  extractMemory = extractorModule.extractMemory || extractMemory;
} catch {}

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
      return res.status(405).json({ error: "Method not allowed" });
    }

    // =========================
    // BODY SAFE
    // =========================
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body || {};

    const message = body.message?.trim();
    const userid = (body.userid || body.userId)?.trim();

    // 🔥 DEBUG MODE ACTIVATION
    const debug = body.debug === true;

    if (!message || !userid) {
      return res.status(400).json({ error: "Missing message or userid" });
    }

    // =========================
    // LOAD MEMORY
    // =========================
    let memory = await getMemory(userid);

    if (debug) {
      console.log("🧠 MEMORY LOAD:", memory);
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

    // =========================
    // EXTRACT MEMORY
    // =========================
    try {
      const newInfo = await extractMemory(message);

      if (newInfo && Object.keys(newInfo).length > 0) {
        await updateMemory(userid, newInfo);
      }
    } catch (e) {
      if (debug) console.log("extract error:", e);
    }

    // reload memory
    memory = await getMemory(userid);

    if (debug) {
      console.log("🧠 MEMORY AFTER UPDATE:", memory);
    }

    // =========================
    // BUILD PROMPT SAFE
    // =========================
    let messages = [];

    try {
      const base = buildPrompt(memory, message);

      const systemMsg = base?.[0] || {
        role: "system",
        content: "Tu es AurX."
      };

      const userMsg = base?.[1] || {
        role: "user",
        content: message
      };

      const history = Array.isArray(memory.chat)
        ? memory.chat.filter(m => m && m.role && m.content)
        : [];

      messages = [
        systemMsg,
        ...history.slice(-10),
        userMsg
      ];

    } catch (e) {
      if (debug) console.log("prompt error:", e);

      messages = [
        { role: "system", content: "Tu es AurX." },
        { role: "user", content: message }
      ];
    }

    if (debug) {
      console.log("💬 MESSAGES SENT TO MODEL:", messages);
    }

    // =========================
    // API KEY
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY_1" });
    }

    // =========================
    // OPENROUTER CALL
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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "";

    // =========================
    // SAVE CHAT
    // =========================
    try {
      const newChat = [
        ...(memory.chat || []),
        { role: "user", content: message },
        { role: "assistant", content: reply }
      ].slice(-50);

      const result = await updateMemory(userid, { chat: newChat });

      if (debug) {
        console.log("💾 CHAT SAVED:", result);
      }

    } catch (e) {
      if (debug) console.log("save error:", e);
    }

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      reply,
      debug: debug ? {
        memory,
        messages
      } : undefined
    });

  } catch (err) {
    console.log("FATAL ERROR:", err);

    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
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

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // =========================
    // BODY
    // =========================
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body || {};

    const message = body.message?.trim();
    const userId = body.userId?.trim();

    if (!message || !userId) {
      return res.status(400).json({ error: "Missing message or userId" });
    }

    // =========================
    // MEMORY LOAD (SAFE)
    // =========================
    let memory = await getMemory(userId);

    if (!memory) {
      memory = {
        userid: userId,
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
        await updateMemory(userId, newInfo);
      }
    } catch {}

    // reload memory after update
    memory = await getMemory(userId);

    // =========================
    // BUILD PROMPT (FIX IMPORTANT)
    // =========================
    let messages = [];

    try {
      messages = buildPrompt(memory, message);

      // 🔥 AJOUT CRITIQUE : injecter le chat historique
      if (Array.isArray(memory.chat) && memory.chat.length > 0) {
        messages = [
          messages[0],
          ...memory.chat.slice(-10), // garde les 10 derniers messages
          messages[messages.length - 1]
        ];
      }

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
    // API KEY
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY_1" });
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

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: "OpenRouter error", details: data });
    }

    const reply = data?.choices?.[0]?.message?.content || "";

    // =========================
    // SAVE CHAT (FIX STABLE)
    // =========================
    try {
      const newChat = [
        ...(memory.chat || []),
        { role: "user", content: message },
        { role: "assistant", content: reply }
      ].slice(-50); // limite mémoire

      await updateMemory(userId, { chat: newChat });

    } catch {}

    return res.status(200).json({ reply });

  } catch (err) {
    console.log("FATAL ERROR:", err);
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
let buildPrompt = () => [];
let getMemory = async () => ({});
let updateMemory = async () => {};
let extractMemory = async () => {};

// =========================
// IMPORTS
// =========================
try {
  const promptModule = await import("../lib/prompt.js");
  buildPrompt = promptModule.buildPrompt || buildPrompt;
} catch (err) {
  console.log("prompt.js error:", err);
}

try {
  const memoryModule = await import("./memory.js");
  getMemory = memoryModule.getMemory || getMemory;
  updateMemory = memoryModule.updateMemory || updateMemory;
} catch (err) {
  console.log("memory.js error:", err);
}

try {
  const extractorModule = await import("./extractor.js");
  extractMemory = extractorModule.extractMemory || extractMemory;
} catch (err) {
  console.log("extractor.js error:", err);
}

const fetchFn = globalThis.fetch;

// =========================
// MAIN HANDLER
// =========================
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
        reply: "Méthode non autorisée."
      });
    }

    // =========================
    // BODY
    // =========================
    let body = {};

    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};
    } catch (err) {
      console.log("body parse error:", err);
      body = {};
    }

    // =========================
    // MESSAGE
    // =========================
    const message = body.message?.trim();

    if (!message) {
      return res.status(400).json({
        reply: "Message manquant."
      });
    }

    // =========================
    // USER ID FIXED
    // =========================
    const userId = (
      body.userId ||
      body.aurx_user_id ||
      "anonymous"
    )
      .trim()
      .toLowerCase();

    console.log("USER ID:", userId);

    // =========================
    // LOAD MEMORY
    // =========================
    let memory = {};

    try {
      memory = await getMemory(userId);

      if (!memory || typeof memory !== "object") {
        memory = {};
      }

    } catch (err) {
      console.log("getMemory error:", err);
      memory = {};
    }

    // =========================
    // EXTRACT MEMORY
    // =========================
    try {
      const newInfo = await extractMemory(message);

      if (
        newInfo &&
        typeof newInfo === "object" &&
        Object.keys(newInfo).length > 0
      ) {

        memory = {
          ...memory,
          ...newInfo
        };

        await updateMemory(userId, memory);

        console.log("MEMORY UPDATED:", memory);
      }

    } catch (err) {
      console.log("extractMemory error:", err);
    }

    // =========================
    // REFRESH MEMORY
    // =========================
    try {
      memory = await getMemory(userId);

      if (!memory || typeof memory !== "object") {
        memory = {};
      }

    } catch (err) {
      console.log("refresh memory error:", err);
    }

    // =========================
    // BUILD PROMPT
    // =========================
    let messages = [];

    try {
      messages = buildPrompt(memory, message);

      if (!Array.isArray(messages)) {
        messages = [];
      }

    } catch (err) {
      console.log("buildPrompt error:", err);
      messages = [];
    }

    // =========================
    // FALLBACK PROMPT
    // =========================
    if (messages.length === 0) {

      messages = [
        {
          role: "system",
          content:
            "Tu es AurX, une intelligence artificielle personnelle moderne, humaine et utile."
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
      return res.status(500).json({
        reply: "Clé API manquante."
      });
    }

    // =========================
    // OPENROUTER CALL
    // =========================
    const response = await fetchFn(
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

    // =========================
    // RESPONSE DATA
    // =========================
    const data = await response.json().catch((err) => {
      console.log("response json error:", err);
      return {};
    });

    console.log("OPENROUTER DATA:", data);

    // =========================
    // REPLY
    // =========================
    const reply =
      data?.choices?.[0]?.message?.content ||
      "Je n’ai pas compris mais je suis là 😊";

    // =========================
    // SAVE CHAT MEMORY
    // =========================
    try {

      const oldChat = Array.isArray(memory.chat)
        ? memory.chat
        : [];

      const newChat = [
        ...oldChat,
        {
          role: "user",
          content: message
        },
        {
          role: "assistant",
          content: reply
        }
      ].slice(-20);

      await updateMemory(userId, {
        ...memory,
        chat: newChat
      });

      console.log("CHAT SAVED");

    } catch (err) {
      console.log("chat save error:", err);
    }

    // =========================
    // SUCCESS RESPONSE
    // =========================
    return res.status(200).json({
      reply
    });

  } catch (err) {

    console.log("FATAL ERROR:", err);

    return res.status(500).json({
      reply: "Erreur interne mais je fonctionne toujours."
    });
  }
}
let buildPrompt = () => [];
let getMemory = async () => ({});
let updateMemory = async () => {};
let extractMemory = async () => {};

// =========================
// IMPORTS DYNAMIQUES
// =========================
try {
  const promptModule = await import("../lib/prompt.js");
  buildPrompt = promptModule.buildPrompt || buildPrompt;
} catch {
  console.log("prompt.js missing");
}

try {
  const memoryModule = await import("./memory.js");
  getMemory = memoryModule.getMemory || getMemory;
  updateMemory = memoryModule.updateMemory || updateMemory;
} catch {
  console.log("memory.js missing");
}

try {
  const extractorModule = await import("./extractor.js");
  extractMemory = extractorModule.extractMemory || extractMemory;
} catch {
  console.log("extractor.js missing");
}

// =========================
// 🌐 WEB SEARCH SAFE (FIX MINIMAL)
// =========================
async function webSearch(query) {
  try {
    const res = await fetch("https://aur-x-pwa.vercel.app/api/webSearch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    });

    if (!res.ok) return null;

    const data = await res.json();

    return data || null;
  } catch (err) {
    console.log("WEB SEARCH FAILED:", err.message);
    return null;
  }
}

// =========================
// 🧠 DETECTION WEB (TON ORIGINAL)
// =========================
function needsWebSearch(message) {
  const msg = message.toLowerCase();

  const forceWeb = [
    "search",
    "recherche",
    "cherche",
    "trouve",
    "find",
    "lookup"
  ];

  const infoSignals = [
    "qui est",
    "combien",
    "prix",
    "valeur",
    "budget",
    "actualité",
    "news",
    "latest",
    "2026",
    "aujourd'hui",
    "actuel",
    "maintenant",
    "bitcoin",
    "elon musk",
    "président",
    "president",
    "cours",
    "prix"
  ];

  const isQuestion =
    msg.includes("?") ||
    msg.startsWith("qui") ||
    msg.startsWith("what") ||
    msg.startsWith("quel") ||
    msg.startsWith("quelle");

  const hasForceWord = forceWeb.some(w => msg.includes(w));
  const hasInfoWord = infoSignals.some(w => msg.includes(w));

  return hasForceWord || hasInfoWord || isQuestion;
}

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
      return res.status(405).json({ error: "Method not allowed" });
    }

    // =========================
    // BODY SAFE
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
    // MEMORY LOAD
    // =========================
    let memory = {};
    try {
      memory = await getMemory(userId);
    } catch {}

    // =========================
    // MEMORY EXTRACTION
    // =========================
    try {
      const newInfo = await extractMemory(message);

      if (newInfo && Object.keys(newInfo).length > 0) {
        await updateMemory(userId, newInfo);
      }
    } catch {}

    // =========================
    // REFRESH MEMORY
    // =========================
    try {
      memory = await getMemory(userId);
    } catch {}

    // =========================
    // 🌐 WEB SEARCH (AJOUT MINIMAL SANS TOUCHER TON LOGIC)
    // =========================
    let webContext = "";

    try {
      if (needsWebSearch(message)) {

        const search = await webSearch(message);

        const answer =
          search?.answer ||
          search?.result ||
          search?.text ||
          search?.content;

        if (answer) {
          webContext = `
🌐 CONTEXTE WEB:
Titre: ${search.title || "N/A"}
Info: ${answer}
Source: ${search.source || "N/A"}
`;
        }
      }
    } catch {
      console.log("WEB CONTEXT ERROR");
    }

    // =========================
    // BUILD PROMPT (TON ORIGINAL + SAFE)
    // =========================
    let messages = [];

    try {
      const result = buildPrompt(memory, message, webContext);

      messages = Array.isArray(result)
        ? result
        : [];
    } catch {
      messages = [];
    }

    if (messages.length === 0) {
      messages = [
        {
          role: "system",
          content: "Tu es AurX, une IA utile."
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
        error: "Missing OPENAI_API_KEY_1"
      });
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

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "";

    // =========================
    // SAVE MEMORY
    // =========================
    try {
      await updateMemory(userId, {
        chat: [
          ...(memory.chat || []),
          { role: "user", content: message },
          { role: "assistant", content: reply }
        ]
      });
    } catch {}

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      reply,
      webSearchUsed: !!webContext
    });

  } catch (err) {
    console.log("FATAL ERROR:", err);

    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
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

const fetchFn = globalThis.fetch;

// =========================
// MAIN HANDLER
// =========================
export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(200).json({ reply: "OK" });

    let body = {};

    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};
    } catch {
      body = {};
    }

    const message = body.message?.trim() || "hello";
    const userId = body.aurx_user_id?.trim() || "anonymous";

    // =========================
    // MEMORY (OPTIONNEL)
    // =========================
    let memory = {};
    try {
      memory = await getMemory(userId);
    } catch {}

    try {
      const newInfo = await extractMemory(message);
      if (newInfo && Object.keys(newInfo).length > 0) {
        await updateMemory(userId, newInfo);
      }
    } catch {}

    try {
      memory = await getMemory(userId);
    } catch {}

    // =========================
    // PROMPT
    // =========================
    let messages = [];

    try {
      messages = buildPrompt(memory, message);
      if (!Array.isArray(messages)) messages = [];
    } catch {}

    if (messages.length === 0) {
      messages = [
        {
          role: "system",
          content: "Tu es AurX, une IA utile et personnelle."
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

    const response = await fetchFn("https://openrouter.ai/api/v1/chat/completions", {
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

    const data = await response.json().catch(() => ({}));

    const reply =
      data?.choices?.[0]?.message?.content ||
      "Je n’ai pas compris mais je suis là.";

    // =========================
    // MEMORY SAVE (SAFE)
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

    return res.status(200).json({ reply });

  } catch {
    return res.status(200).json({
      reply: "Erreur interne mais je fonctionne toujours."
    });
  }
}
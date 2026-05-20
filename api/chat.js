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

// =========================
// SAFE FETCH
// =========================
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
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // =========================
    // SAFE BODY PARSING
    // =========================
    let body = {};

    try {
      if (req.body) {
        body = typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body;
      }
    } catch (e) {
      console.log("❌ JSON PARSE ERROR:", e);
      body = {};
    }

    console.log("🔥 BODY FINAL:", body);

    const message = body.message?.trim();
    const userId = body.aurx_user_id?.trim();

    console.log("MESSAGE:", message);
    console.log("USERID:", userId);

    if (!message || !userId) {
      return res.status(400).json({
        error: "Missing message or aurx_user_id"
      });
    }

    // =========================
    // MEMORY LOAD
    // =========================
    let memory = {};
    try {
      memory = await getMemory(userId);
    } catch (e) {
      console.log("❌ MEMORY LOAD ERROR:", e);
    }

    // =========================
    // MEMORY EXTRACTION
    // =========================
    try {
      const newInfo = await extractMemory(message);
      if (newInfo && Object.keys(newInfo).length > 0) {
        await updateMemory(userId, newInfo);
      }
    } catch (e) {
      console.log("❌ EXTRACT ERROR:", e);
    }

    // =========================
    // REFRESH MEMORY
    // =========================
    try {
      memory = await getMemory(userId);
    } catch {}

    // =========================
    // BUILD PROMPT
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
    // OPENROUTER API
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing API key" });
    }

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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content || "";

    // =========================
    // SAVE MEMORY (NON BLOQUANT)
    // =========================
    try {
      await updateMemory(userId, {
        chat: [
          ...(memory.chat || []),
          { role: "user", content: message },
          { role: "assistant", content: reply }
        ]
      });
    } catch (e) {
      console.log("❌ SAVE MEMORY ERROR:", e);
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.log("❌ SERVER CRASH:", err);
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
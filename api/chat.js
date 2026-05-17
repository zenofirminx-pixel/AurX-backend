let buildPrompt = () => [];
let getMemory = async () => ({});
let updateMemory = async () => {};
let extractMemory = async () => ({});

try {
  const promptModule = await import("../lib/prompt.js");
  buildPrompt = promptModule.buildPrompt || buildPrompt;
} catch (e) {
  console.log("prompt.js missing or broken");
}

try {
  const memoryModule = await import("./memory.js");
  getMemory = memoryModule.getMemory || getMemory;
  updateMemory = memoryModule.updateMemory || updateMemory;
} catch (e) {
  console.log("memory.js missing or broken");
}

try {
  const extractorModule = await import("./extractor.js");
  extractMemory = extractorModule.extractMemory || extractMemory;
} catch (e) {
  console.log("extractor.js missing or broken");
}

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
    let body = {};
    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};
    } catch {
      body = {};
    }

    const message = body.message?.trim();
    const userId = body.userId?.trim();

    if (!message) {
      return res.status(400).json({ error: "Message vide" });
    }

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // =========================
    // MEMORY SAFE
    // =========================
    let memory = {};

    try {
      memory = await getMemory(userId);
    } catch (e) {
      console.log("memory error:", e);
    }

    // =========================
    // EXTRACTION SAFE
    // =========================
    try {
      const newInfo = await extractMemory(message);
      if (newInfo && Object.keys(newInfo).length > 0) {
        await updateMemory(userId, newInfo);
      }
    } catch (e) {
      console.log("extract error:", e);
    }

    // =========================
    // REFRESH MEMORY
    // =========================
    let updatedMemory = memory;

    try {
      updatedMemory = await getMemory(userId);
    } catch {}

    // =========================
    // BUILD PROMPT SAFE
    // =========================
    let messages = [];

    try {
      const result = buildPrompt(updatedMemory, message);

      if (Array.isArray(result)) {
        messages = result;
      }
    } catch (e) {
      messages = [{ role: "user", content: message }];
    }

    if (!messages.length) {
      messages = [{ role: "user", content: message }];
    }

    // =========================
    // API KEY SAFE
    // =========================
    const apiKey = process.env.OPENAI_API_KEY_1;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY_1 in Vercel"
      });
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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(500).json({
        error: "OpenRouter error",
        details: data
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    return res.status(200).json({
      reply: reply || "..."
    });

  } catch (err) {
    console.log("FATAL ERROR:", err);

    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
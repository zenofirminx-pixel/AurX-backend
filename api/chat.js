let buildPrompt = () => [];
let getMemory = async () => ({});
let updateMemory = async () => {};
let extractMemory = async () => {};

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
// GET MEMORY  
// =========================  
let memory = {};  
try {  
  memory = await getMemory(userId);  
} catch {}  

// =========================  
// EXTRACT NEW INFO  
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
// BUILD PROMPT (IMPORTANT)  
// =========================  
let messages = [];  

try {  
  messages = buildPrompt(memory, message);  

  if (!Array.isArray(messages)) {  
    messages = [];  
  }  
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
const apiKey = process.env.OPENAI_API_KEY_2;  

if (!apiKey) {  
  return res.status(500).json({  
    error: "Missing OPENAI_API_KEY_2"  
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
// SAVE CHAT MEMORY (IMPORTANT FIX)  
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
  reply  
});

} catch (err) {
console.log("FATAL ERROR:", err);

return res.status(500).json({  
  error: "Server crash",  
  details: err.message  
});

}
}
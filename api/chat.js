import { buildPrompt } from "../lib/buildPrompt.js";  
import db from "./initMemory.js";  
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
// =========================  
// CORS  
// =========================  
function setCors(res) {  
  res.setHeader("Access-Control-Allow-Origin", "*");  
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");  
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");  
}  

// =========================  
// HANDLER  
// =========================  
export default async function handler(req, res) {  
  try {  
    setCors(res);  

    if (req.method === "OPTIONS") {  
      return res.status(200).end();  
    }  

    if (req.method !== "POST") {  
      return res.status(405).json({ error: "Method not allowed" });  
    }  

    // =========================  
    // SAFE BODY PARSE  
    // =========================  
    let body = {};  

    try {  
      body =  
        typeof req.body === "string"  
          ? JSON.parse(req.body)  
          : req.body || {};  
    } catch {}  

    const message = body.message?.trim();
const userId = body.userId || "test_user";

// 🧠 MEMORY LAYER (AJOUT)
const memories = extractMemory(message);
await saveMemory(db, userId, memories);
    if (!message) {  
      return res.status(400).json({ error: "Missing message" });  
    }  

    const now = Date.now(); // ✅ TIME UNIQUE POUR CE MESSAGE  

    // =========================  
    // MEMORY  
    // =========================  
    const snapshot = await db  
      .collection("users")  
      .doc(userId)  
      .collection("messages")  
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();  

    const history = [];

snapshot.forEach(doc => {
  const data = doc.data();

  history.unshift({
    role: data.role,
    content: data.text
  });
});

    // =========================  
    // PROMPT  
    // =========================  
    const messages = [  
      ...history,  
      ...buildPrompt(message)  
    ];  

    // =========================  
    // API KEY  
    // =========================  
    const apiKey = process.env.OPENAI_API_KEY_5;  

    if (!apiKey) {  
      return res.status(500).json({  
        error: "Missing OPENAI_API_KEY_5"  
      });  
    }  

    // SAVE USER MESSAGE  
    await db  
      .collection("users")  
      .doc(userId)  
      .collection("messages")  
      .add({  
        role: "user",  
        text: message,  
        timestamp: now  
      });  

    // =========================  
    // OPENROUTER REQUEST  
    // =========================  
    const response = await fetch(  
      "https://openrouter.ai/api/v1/chat/completions",  
      {  
        method: "POST",  
        headers: {  
          "Content-Type": "application/json",  
          Authorization: `Bearer ${apiKey}`,  
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

    const reply =  
      data?.choices?.[0]?.message?.content ||  
      "Aucune réponse.";  

    const replyTime = Date.now(); // ✅ TIME ASSISTANT  

    // SAVE ASSISTANT MESSAGE  
    await db  
      .collection("users")  
      .doc(userId)  
      .collection("messages")  
      .add({  
        role: "assistant",  
        text: reply,  
        timestamp: replyTime  
      });  

    // =========================  
    // RESPONSE (FIX IMPORTANT)  
    // =========================  
    return res.status(200).json({  
      reply,  
      timestamp: replyTime // ✅ AJOUT POUR LE FRONT  
    });  

  } catch (err) {  
    return res.status(500).json({  
      error: "Server crash",  
      details: err.message  
    });  
  }  
}
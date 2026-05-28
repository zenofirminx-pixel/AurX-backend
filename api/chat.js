import { buildPrompt } from "../lib/buildPrompt.js";
import db from "../lib/firebase.js";

// =========================
// CORS
// =========================
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// =========================
// FORMATTER
// =========================
function formatReply(text = "") {
  let output = text.trim();

  output = output.replace(/\n{3,}/g, "\n\n");
  output = output.replace(/Si tu as d'autres questions.*$/gi, "");
  output = output.replace(/(\d+\.\s)/g, "\n$1");
  output = output.replace(/(#+\s)/g, "\n$1");
  output = output.replace(/\. ([A-ZÀ-Ÿ])/g, ".\n\n$1");
  output = output.replace(/\n{3,}/g, "\n\n").trim();

  return output;
}

// =========================
// HANDLER
// =========================
export default async function handler(req, res) {
  try {
    console.log("STEP 1 OK");

    const body = req.body || {};
    console.log("STEP 2 OK", body);

    return res.status(200).json({
      ok: true,
      step: "all good"
    });

  } catch (err) {
    console.log("CRASH:", err);
    return res.status(500).json({
      error: err.message
    });
  }
}

    // =========================
    // BODY SAFE PARSE
    // =========================
    let body = {};

    try {
      body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body || {};
    } catch {}

    const message = body.message?.trim();
    const userId = body.userId || "anonymous";

    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    // =========================
    // FIREBASE USER + MEMORY
    // =========================
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    let memory = [];

    if (userDoc.exists) {
      memory = userDoc.data().memory || [];
    } else {
      await userRef.set({
        userId,
        createdAt: Date.now(),
        memory: [],
        platforms: []
      });
    }

    const memoryContext = memory.length
      ? memory.join("\n")
      : "Aucune mémoire pour cet utilisateur.";
       
    // =========================
    // PROMPT
    // =========================
    let messages = buildPrompt(message);

    if (Array.isArray(messages) && messages.length >= 2) {
      messages[1].content = `
[MEMORY AURX]
${memoryContext}

${messages[1].content}
      `.trim();
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

    // =========================
    // RESPONSE TEXT
    // =========================
    const rawReply =
      data?.choices?.[0]?.message?.content ||
      "Aucune réponse.";

    const finalReply = formatReply(rawReply);

    // =========================
    // SAVE MEMORY (LAST 10 MESSAGES)
    // =========================
    await userRef.update({
      memory: [...memory.slice(-10), message]
    });

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      reply: finalReply,
      memoryUpdated: true
    });

  } catch (err) {
    return res.status(500).json({
      error: "Server crash",
      details: err.message
    });
  }
}
import db from "./initMemory.js";
import { extractMemory } from "../lib/memoryExtractor.js";
import { saveMemory } from "../lib/saveMemory.js";
import { parse, serialize } from "cookie";
import { randomUUID } from "crypto";

export const config = { maxDuration: 60 };

// ===== PROMPT =====
const BASE_PROMPT = `
# COMMUNICATION STYLE
Réponds naturellement, clairement et directement.

# IDENTITY
Tu es AurX.
`;

// ===== GOOGLE TEST SEARCH =====
async function googleSearch(query) {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`
    );

    const data = await res.json();

    return {
      usedWeb: true,
      results:
        data.RelatedTopics?.slice(0, 5).map((item) => ({
          title: item.Text,
          info: item.Text,
          link: item.FirstURL,
        })) || [],
    };
  } catch (e) {
    return { usedWeb: false, results: [] };
  }
}

// ===== CORS =====
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ===== MAIN =====
export default async function handler(req, res) {
  setCors(res);
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Content-Type", "text/event-stream");

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const message = body.message?.trim();
    const convId = body.convId;

    if (!message) return;

    // =========================
    // 🌐 WEB TEST FORCÉ GOOGLE
    // =========================
    const webData = await googleSearch(message);

    console.log("WEB TEST:", webData);

    // =========================
    // PROMPT BUILD
    // =========================
    let instructions = `Instructions système :\n${BASE_PROMPT}\n\n`;

    if (webData.usedWeb && webData.results.length > 0) {
      instructions += `
╔══════════════════════╗
║  GOOGLE SEARCH DATA  ║
╚══════════════════════╝

`;

      webData.results.forEach((r, i) => {
        instructions += `${i + 1}. ${r.title}\n`;
        if (r.link) instructions += `   ${r.link}\n`;
      });

      instructions += `
IMPORTANT:
- utilise ces données comme source réelle
- ne dis pas que tu n'as pas accès au web
`;
    }

    const messages = [
      { role: "system", content: instructions },
      { role: "user", content: message },
    ];

    // =========================
    // OPENROUTER
    // =========================
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages,
          stream: true,
          temperature: 0.7,
        }),
      }
    );

    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;

          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch {}
      }
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error(err);
    res.end();
  }
}
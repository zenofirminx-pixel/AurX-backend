import { buildPrompt } from "../lib/buildPrompt.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method!== "POST") return res.status(405).json({ error: "Method not allowed" });

  // SSE HEADERS
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const sendError = (msg) => {
    try {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch {}
  };

  try {
    // BODY
    const body = typeof req.body === "string"? JSON.parse(req.body) : req.body || {};
    const message = body.message?.trim();

    if (!message) return sendError("Missing message");

    // PROMPT - IMPORT SEULEMENT
    const systemPrompt = buildPrompt();

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ];

    console.log("[GPT] Streaming message:", message);

    // OPENROUTER
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY_1}`,
        "HTTP-Referer": "https://aurx.vercel.app",
        "X-Title": "AurX"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages,
        stream: true,
        temperature: 0.7
      })
    });

    if (!response.ok ||!response.body) {
      const err = await response.text();
      console.error("OpenRouter error:", response.status, err);
      return sendError("AI service error");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // STREAM LOOP
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() ||!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;

            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
              if (res.flush) res.flush();
            }
          } catch (e) {
            console.error("Parse error:", e);
          }
        }
      }
    } catch (e) {
      console.error('Stream error:', e);
      res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (err) {
    console.error("Server crash:", err);
    sendError("Server error");
  }
}
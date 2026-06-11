import { buildPrompt } from "../lib/buildPrompt.js";

function setCors(res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://aurx.vercel.app"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true"
  );
}

export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const message = body.message?.trim();

    if (!message) {
      return res.status(400).json({
        error: "Missing message"
      });
    }

    const systemPrompt = buildPrompt();

    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: message
      }
    ];

    res.setHeader(
      "Content-Type",
      "text/event-stream"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
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
      }
    );

    if (!response.ok || !response.body) {
      res.write(
        `data: ${JSON.stringify({
          error: "OpenRouter error"
        })}\n\n`
      );

      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } =
        await reader.read();

      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: "))
          continue;

        const data = line.slice(6);

        if (data === "[DONE]") {
          continue;
        }

        try {
          const parsed = JSON.parse(data);

          const content =
            parsed.choices?.[0]?.delta?.content;

          if (content) {
            res.write(
              `data: ${JSON.stringify({
                content
              })}\n\n`
            );
          }
        } catch {}
      }
    }

    res.end();
  } catch (err) {
    console.error(err);

    if (!res.headersSent) {
      res.status(500).json({
        error: err.message
      });
    }
  }
}
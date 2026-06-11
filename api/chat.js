export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  // CORS (important sinon fetch peut échouer silencieusement)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(200).json({
      ok: true,
      message: "Backend alive (GET OK, use POST for SSE)",
    });
  }

  // SSE HEADERS
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders?.();

  try {
    const body = req.body || {};
    const msg = body.message || "vide";

    // 1er chunk
    res.write(`data: ${JSON.stringify({ content: "👋 Connexion OK" })}\n\n`);

    await new Promise((r) => setTimeout(r, 800));

    // 2e chunk
    res.write(
      `data: ${JSON.stringify({
        content: "Tu as envoyé: " + msg,
      })}\n\n`
    );

    await new Promise((r) => setTimeout(r, 800));

    // FIN
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    res.write(
      `data: ${JSON.stringify({
        error: "Crash backend minimal",
        details: err.message,
      })}\n\n`
    );
    res.end();
  }
}
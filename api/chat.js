export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const message = body?.message;

    return res.status(200).json({
      debug: true,
      messageReceived: message,
      keys: {
        k1: !!process.env.OPENAI_API_KEY_1,
        k2: !!process.env.OPENAI_API_KEY_2,
        k3: !!process.env.OPENAI_API_KEY_3,
        k4: !!process.env.OPENAI_API_KEY_4
      }
    });

  } catch (e) {
    return res.status(500).json({
      error: "Crash backend",
      details: e.message
    });
  }
}
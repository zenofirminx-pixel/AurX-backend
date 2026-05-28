import { buildPrompt } from "../lib/buildPrompt.js";

export default async function handler(req, res) {
  try {
    const messages = buildPrompt("test");

    return res.status(200).json({
      ok: true,
      buildPrompt: true,
      messages
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
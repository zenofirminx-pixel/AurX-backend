import db from "../lib/firebase.js";

export default async function handler(req, res) {
  try {
    const test = await db.collection("users").limit(1).get();

    return res.status(200).json({
      ok: true,
      firebase: true,
      size: test.size
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
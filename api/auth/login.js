import admin from "firebase-admin";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { uid } = req.body;

    const token = await admin.auth().createCustomToken(uid);

    return res.status(200).json({ token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
import admin from "firebase-admin";
import db from "../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { email, password, name } = req.body;

    const user = await admin.auth().createUser({
      email,
      password,
      displayName: name
    });

    await db.collection("users").doc(user.uid).set({
      profile: { email, name },
      createdAt: Date.now()
    });

    return res.status(200).json({ uid: user.uid });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
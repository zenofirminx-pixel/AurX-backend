import crypto from "crypto";
import db from "../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  // 🔍 find user
  const snapshot = await db
    .collection("users")
    .where("email", "==", email)
    .get();

  if (snapshot.empty) {
    return res.status(401).json({ error: "User not found" });
  }

  const userDoc = snapshot.docs[0];
  const user = userDoc.data();
  const userId = userDoc.id;

  // ⚠️ password check (simple version)
  if (user.password !== password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // 🔐 create session
  const sessionId = crypto.randomUUID();

  await db.collection("sessions").doc(sessionId).set({
    userId,
    createdAt: Date.now()
  });

  // 🍪 set cookie (IMPORTANT FIX)
  res.setHeader(
    "Set-Cookie",
    `session=${sessionId}; HttpOnly; Path=/; SameSite=None; Secure; Max-Age=604800`
  );

  return res.status(200).json({
    success: true,
    user: { email }
  });
}
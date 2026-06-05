import db from "../lib/db.js";
import admin from "firebase-admin";
import crypto from "crypto";

// =========================
// CORS
// =========================
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// =========================
// COOKIE BUILDER
// =========================
function setSessionCookie(res, sessionToken) {
  res.setHeader(
    "Set-Cookie",
    `session=${sessionToken}; HttpOnly; Path=/; Max-Age=604800; SameSite=None; Secure`
  );
}

// =========================
// HASH SIMPLE (si pas bcrypt encore)
// =========================
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// =========================
// HANDLER
// =========================
export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // =========================
    // BODY SAFE PARSE
    // =========================
    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const { email, password } = body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const hashedPassword = hashPassword(password);

    // =========================
    // FIREBASE USER SEARCH
    // =========================
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("email", "==", email).limit(1).get();

    if (snapshot.empty) {
      return res.status(401).json({ error: "User not found" });
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    // =========================
    // PASSWORD CHECK
    // =========================
    if (userData.password !== hashedPassword) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    // =========================
    // SESSION TOKEN
    // =========================
    const sessionToken = crypto.randomBytes(32).toString("hex");

    await db.collection("sessions").doc(sessionToken).set({
      userId: userDoc.id,
      email,
      createdAt: Date.now(),
    });

    setSessionCookie(res, sessionToken);

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      success: true,
      user: {
        id: userDoc.id,
        email,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
}
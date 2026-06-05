import db from "../lib/db.js";
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
// HASH PASSWORD
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
    // SAFE BODY PARSE
    // =========================
    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const { email, password } = body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const usersRef = db.collection("users");

    // =========================
    // CHECK EXISTING USER
    // =========================
    const existing = await usersRef.where("email", "==", email).limit(1).get();

    if (!existing.empty) {
      return res.status(409).json({ error: "User already exists" });
    }

    const userId = crypto.randomUUID();
    const hashedPassword = hashPassword(password);

    // =========================
    // CREATE USER STRUCTURE
    // =========================
    await usersRef.doc(userId).set({
      email,
      password: hashedPassword,
      createdAt: Date.now(),

      // 🧠 AURX MEMORY STRUCTURE READY
      profile: {
        name: "",
        country: "",
        role: "user"
      },

      memory: {
        facts: [],
        preferences: [],
        interactions: 0
      },

      settings: {
        theme: "dark",
        language: "fr"
      }
    });

    // =========================
    // INIT MESSAGE COLLECTION
    // =========================
    await db
      .collection("users")
      .doc(userId)
      .collection("messages")
      .doc("init")
      .set({
        system: true,
        createdAt: Date.now(),
        text: "Memory initialized for AurX"
      });

    return res.status(200).json({
      success: true,
      userId
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
}
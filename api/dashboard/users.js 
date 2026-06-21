import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  // 🌐 CORS (comme tes endpoints qui marchent)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const snap = await db.collection("users").get();

    let users = [];

    snap.forEach((doc) => {
      const data = doc.data();

      users.push({
        id: doc.id,

        // 👤 identité (safe fallback)
        name: data.name || "unknown",
        email: data.email || "unknown",
        photo: data.photo || null,

        // 📊 activité (compatible avec ton système existant)
        lastLogin: data.lastLogin || data.updatedAt || data.createdAt || null,
        messagesCount: data.messagesCount || data.messages?.length || 0,

        // 🌍 meta
        language: data.language || "unknown",
        provider: data.provider || "google",

        createdAt: data.createdAt || null,
      });
    });

    return res.status(200).json({
      success: true,
      total: users.length,
      users,
    });

  } catch (error) {
    // 🔥 important: jamais crash Vercel
    return res.status(200).json({
      success: false,
      total: 0,
      users: [],
      error: error.message,
    });
  }
}
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
  // 🌐 CORS (comme ton architecture actuelle)
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
    const snapshot = await db.collection("users").get();

    const users = snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,

        // 👤 données user (compatibles avec ton système actuel)
        name: data.name || null,
        email: data.email || null,
        photo: data.photo || null,

        // 📊 activité
        lastLogin: data.lastLogin || data.updatedAt || null,
        messagesCount: data.messagesCount || 0,

        // 🌍 meta
        language: data.language || "unknown",
        createdAt: data.createdAt || null,
      };
    });

    return res.status(200).json({
      success: true,
      total: users.length,
      users,
    });

  } catch (error) {
    return res.status(200).json({
      success: false,
      total: 0,
      users: [],
      error: error.message,
    });
  }
}
// /api/initMemory.js
import admin from "firebase-admin";

// Initialisation Firebase Admin (si pas déjà initialisé)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  try {
    const userId = "test_user"; // ton document parent

    // Exemple : quelques messages pour la mémoire
    const messages = [
      { role: "system", text: "first_memory", timestamp: Date.now() },
      { role: "user", text: "Salut AurX", timestamp: Date.now() + 1 },
      { role: "assistant", text: "Bonjour !", timestamp: Date.now() + 2 },
    ];

    // Ajouter tous les messages dans la collection users/test_user/messages
    for (let msg of messages) {
      await db.collection("users")
        .doc(userId)
        .collection("messages")
        .add(msg);
    }

    res.status(200).json({ success: true, message: "Mémoire créée !" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
}
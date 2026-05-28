import db from "../lib/firebase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: "Missing userId or message" });
    }

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    // 1. Créer user si inexistant
    if (!userDoc.exists) {
      await userRef.set({
        userId,
        createdAt: Date.now(),
        memory: [],
        platforms: []
      });
    }

    const userData = (await userRef.get()).data();

    // 2. Construire mémoire pour IA
    const memory = userData.memory || [];

    const prompt = `
Tu es AurX, une IA intelligente.
Voici les infos utilisateur :
- userId: ${userId}
- mémoire: ${memory.join(", ")}

Utilisateur dit : ${message}
Réponds naturellement et utilement.
`;

    // 3. Réponse simple (placeholder IA)
    const reply = `AurX: j'ai compris "${message}"`;

    // 4. Sauvegarder mémoire
    await userRef.update({
      memory: [...memory.slice(-10), message]
    });

    return res.status(200).json({
      reply,
      memoryUpdated: true
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
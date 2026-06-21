import { getFirestore } from "firebase-admin/firestore";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  try {
    const snapshot = await db.collection("users").get();

    const users = snapshot.docs.map(doc => {
      const data = doc.data();

      return {
        id: doc.id,
        name: data.name || null,
        email: data.email || null,
        photo: data.photo || null,
        language: data.language || null,
        lastLogin: data.lastLogin || null,
        messagesCount: data.messagesCount || 0,
        createdAt: data.createdAt || null
      };
    });

    res.status(200).json({
      total: users.length,
      users
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
}
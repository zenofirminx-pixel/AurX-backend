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
    const usersSnap = await db.collection("users").get();
    const logsSnap = await db.collection("logs").get();

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    let activeUsers = 0;

    usersSnap.forEach(doc => {
      const data = doc.data();
      if (data.lastLogin && (now - data.lastLogin) < oneDay) {
        activeUsers++;
      }
    });

    res.status(200).json({
      totalUsers: usersSnap.size,
      activeUsers,
      totalLogs: logsSnap.size,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
}
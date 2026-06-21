import admin from "firebase-admin";

function getDB() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n')
      })
    });
  }
  return admin.firestore();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://dashboard-for-aurx.vercel.app");
  
  try {
    const db = getDB(); // init seulement au runtime
    const snap = await db.collection("users").limit(10).get();
    const users = snap.docs.map(d => ({ uid: d.id }));
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
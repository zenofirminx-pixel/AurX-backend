export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://dashboard-for-aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Lazy load Firebase pour éviter crash build
  let admin;
  try {
    admin = (await import("firebase-admin")).default;
  } catch {
    return res.status(500).json({ error: "firebase-admin pas installé dans backend" });
  }

  if (!admin.apps.length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!privateKey) return res.status(500).json({ error: "FIREBASE_PRIVATE_KEY manquante" });

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey
      })
    });
  }

  try {
    const db = admin.firestore();
    const snap = await db.collection("users").get();
    const users = snap.docs.map(d => ({ uid: d.id }));
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://dashboard-for-aurx.vercel.app");
  
  try {
    const snap = await db.collection("users").get();
    const users = [];

    for (const doc of snap.docs) {
      const uid = doc.id; // google_110618639455189356267
      const memSnap = await db.collection("users").doc(uid).collection("memory").get();
      
      let data = { uid, name: uid, email: null, verified: false };
      memSnap.forEach(m => {
        const {key, value} = m.data();
        if (key === "name") data.name = value;
        if (key === "email") data.email = value;
        if (key === "verified") data.verified = value;
      });

      users.push(data);
    }

    res.status(200).json({ users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
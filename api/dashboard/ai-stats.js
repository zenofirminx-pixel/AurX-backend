export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://dashboard-for-aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  try {
    const admin = (await import("firebase-admin")).default;

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
    const usersSnap = await db.collection("users").get();

    let totalMessages = 0;
    let activeToday = 0;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    for (const doc of usersSnap.docs) {
      const uid = doc.id;
      const msgSnap = await db.collection("users").doc(uid).collection("messages").get();
      totalMessages += msgSnap.size;

      const lastMsg = msgSnap.docs
       .map(d => d.data().timestamp)
       .filter(t => t)
       .sort((a,b) => b-a)[0];

      if (lastMsg && now - lastMsg < oneDay) activeToday++;
    }

    res.status(200).json({
      totalUsers: usersSnap.size,
      totalMessages,
      activeToday,
      updatedAt: now
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
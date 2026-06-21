export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://dashboard-for-aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  try {
    const admin = (await import("firebase-admin")).default;

    if (!admin.apps.length) {
      const key = process.env.FIREBASE_PRIVATE_KEY;
      if (!key) throw new Error("FIREBASE_PRIVATE_KEY manquante");

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: key.replace(/\\n/g, '\n')
        })
      });
    }

    const db = admin.firestore();
    const usersSnap = await db.collection("users").get();

    const users = [];
    for (const doc of usersSnap.docs) {
      const uid = doc.id;
      const memSnap = await db.collection("users").doc(uid).collection("memory").get();

      let data = { uid, name: uid, email: null, verified: false, lastActive: null };
      memSnap.forEach(m => {
        const d = m.data();
        if (d.key === "name") data.name = d.value;
        if (d.key === "email") data.email = d.value;
        if (d.key === "verified") data.verified = d.value;
      });

      const lastMsg = await db.collection("users").doc(uid).collection("messages")
       .orderBy("timestamp", "desc").limit(1).get();
      if (!lastMsg.empty) data.lastActive = lastMsg.docs[0].data().timestamp;

      users.push(data);
    }

    res.status(200).json({ users: users.sort((a,b) => (b.lastActive||0)-(a.lastActive||0)) });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
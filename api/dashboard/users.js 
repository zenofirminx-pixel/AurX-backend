import db from "../initMemory.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://dashboard-for-aurx.vercel.app");

  try {
    const usersSnap = await db.collection("users").get();
    const users = [];

    for (const u of usersSnap.docs) {
      const memSnap = await u.ref.collection("memory").get();
      let name = null, email = null, verified = false;

      memSnap.forEach(doc => {
        const d = doc.data();
        if (d.key === "name") name = d.value;
        if (d.key === "email") email = d.value;
        if (d.key === "verified") verified = d.value;
      });

      const lastMsg = await u.ref.collection("messages")
      .orderBy("timestamp", "desc").limit(1).get();
      const lastActive = lastMsg.empty? null : lastMsg.docs[0].data().timestamp;

      users.push({
        uid: u.id, // ex: google_110618639455189356267
        name: name || u.id,
        email,
        verified,
        lastActive,
        msgCount: (await u.ref.collection("messages").get()).size
      });
    }

    res.json({ users: users.sort((a,b)=>b.lastActive-a.lastActive) });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
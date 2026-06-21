import db from "../initMemory.js";

export default async function handler(req, res) {
  // CORS si ton dashboard est sur un autre domaine
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Compte total users
    const usersSnap = await db.collection("users").get();
    const totalUsers = usersSnap.size;

    // 2. Stats 24h
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let requests24h = 0;
    let activeUsers = 0;

    // Boucle sur chaque user pour compter ses messages récents
    for (const userDoc of usersSnap.docs) {
      const msgsSnap = await userDoc.ref.collection("messages")
        .where("timestamp", ">", dayAgo)
        .get();
      
      if (msgsSnap.size > 0) {
        activeUsers++;
        requests24h += msgsSnap.size;
      }
    }

    // 3. Check Firebase
    let firebaseStatus = "OK";
    try {
      await db.collection("users").limit(1).get();
    } catch {
      firebaseStatus = "Error";
    }

    res.status(200).json({
      totalUsers,
      activeUsers24h: activeUsers,
      requests24h,
      avgRequestsPerUser: totalUsers > 0 ? (requests24h / totalUsers).toFixed(1) : 0,
      firebaseStatus,
      timestamp: Date.now()
    });

  } catch (err) {
    console.error("Overview error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
}
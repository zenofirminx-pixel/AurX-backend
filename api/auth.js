import admin from "firebase-admin";

// INIT FIREBASE ADMIN
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 🔐 1. Récupérer token Firebase depuis header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split("Bearer ")[1];

    // 🔐 2. Vérifier token Firebase
    const decoded = await admin.auth().verifyIdToken(token);

    const uid = decoded.uid;
    const email = decoded.email || "";
    const displayName = decoded.name || "AurX User";

    const userRef = db.collection("users").doc(uid);
    const snap = await userRef.get();

    // =========================
    // 🆕 NEW USER
    // =========================
    if (!snap.exists) {
      const newUser = {
        uid,
        email,
        displayName,
        createdAt: Date.now(),

        premium: {
          active: false,
          plan: "free",
          expiresAt: null,
        },

        usage: {
          dailyCount: 0,
          lastReset: Date.now(),
          blockedUntil: null,
        },

        memory: {
          facts: [],
          preferences: {},
          personality: {},
        },

        security: {
          lastLogin: Date.now(),
          loginCount: 1,
          banned: false,
        },
      };

      await userRef.set(newUser);

      return res.json({
        success: true,
        status: "created",
        user: newUser,
      });
    }

    // =========================
    // 🔄 EXISTING USER
    // =========================
    await userRef.update({
      "security.lastLogin": Date.now(),
      "security.loginCount": admin.firestore.FieldValue.increment(1),
    });

    const userData = (await userRef.get()).data();

    return res.json({
      success: true,
      status: "login",
      user: userData,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Auth failed",
      details: error.message,
    });
  }
}
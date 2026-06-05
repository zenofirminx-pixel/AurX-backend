import db from "../lib/db.js";

// =========================
// CORS
// =========================
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// =========================
// EXTRACT COOKIE
// =========================
function getSessionFromCookie(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

// =========================
// HANDLER
// =========================
export default async function handler(req, res) {
  try {
    setCors(res);

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // =========================
    // GET SESSION TOKEN
    // =========================
    const sessionToken = getSessionFromCookie(req);

    if (!sessionToken) {
      return res.status(401).json({ error: "No session" });
    }

    // =========================
    // CHECK SESSION IN FIREBASE
    // =========================
    const sessionDoc = await db.collection("sessions").doc(sessionToken).get();

    if (!sessionDoc.exists) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const sessionData = sessionDoc.data();
    const userId = sessionData.userId;

    // =========================
    // GET USER DATA
    // =========================
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = userDoc.data();

    // =========================
    // RESPONSE CLEAN
    // =========================
    return res.status(200).json({
      authenticated: true,
      user: {
        id: userDoc.id,
        email: user.email,
        profile: user.profile,
        settings: user.settings,
        memory: user.memory
      }
    });

  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
}
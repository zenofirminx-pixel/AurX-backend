import db from "../lib/db.js";
import crypto from "crypto";

export default async function handler(req, res) {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).json({ error: "Missing code" });
    }

    // =========================
    // EXCHANGE CODE → TOKEN
    // =========================
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code"
      })
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return res.status(400).json({
        error: "Token exchange failed",
        details: tokenData
      });
    }

    // =========================
    // GET USER INFO
    // =========================
    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const googleUser = await userRes.json();

    // =========================
    // FIND OR CREATE USER
    // =========================
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("email", "==", googleUser.email).limit(1).get();

    let userId;

    if (snapshot.empty) {
      userId = crypto.randomUUID();

      await usersRef.doc(userId).set({
        email: googleUser.email,
        googleId: googleUser.id,
        createdAt: Date.now(),
        profile: {
          name: googleUser.name,
          picture: googleUser.picture
        },
        memory: {
          facts: [],
          interactions: 0
        }
      });
    } else {
      userId = snapshot.docs[0].id;
    }

    // =========================
    // SESSION
    // =========================
    const sessionToken = crypto.randomBytes(32).toString("hex");

    await db.collection("sessions").doc(sessionToken).set({
      userId,
      createdAt: Date.now()
    });

    res.setHeader(
      "Set-Cookie",
      `session=${sessionToken}; HttpOnly; Path=/; SameSite=None; Secure; Max-Age=604800`
    );

    // =========================
    // REDIRECT FRONT
    // =========================
    return res.redirect("https://aurx.vercel.app");

  } catch (err) {
    return res.status(500).json({
      error: "Google OAuth failed",
      details: err.message
    });
  }
}
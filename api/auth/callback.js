import admin from "firebase-admin";
import db from "../../lib/db.js";

export default async function handler(req, res) {
  const { code } = req.query;

  try {
    // ⚠️ échange code Google
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

    const accessToken = tokenData.access_token;

    const userInfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const profile = await userInfoRes.json();

    // créer user Firebase si nouveau
    let user;

    try {
      user = await admin.auth().getUserByEmail(profile.email);
    } catch {
      user = await admin.auth().createUser({
        email: profile.email,
        displayName: profile.name
      });
    }

    await db.collection("users").doc(user.uid).set(
      {
        profile: {
          email: profile.email,
          name: profile.name,
          photo: profile.picture
        },
        provider: "google"
      },
      { merge: true }
    );

    res.redirect("https://aurx.vercel.app"); // retour front
  } catch (err) {
    res.status(500).send(err.message);
  }
}
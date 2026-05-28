import admin from "firebase-admin";

let db = null;

try {
  if (!admin.apps.length) {
    const rawKey = process.env.FIREBASE_KEY;

    if (!rawKey) {
      throw new Error("FIREBASE_KEY missing in env");
    }

    let serviceAccount;

    try {
      serviceAccount = JSON.parse(rawKey);
    } catch (e) {
      throw new Error("FIREBASE_KEY is not valid JSON");
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log("Firebase initialized");
  }

  db = admin.firestore();

} catch (err) {
  console.error("FIREBASE ERROR:", err.message);
}

export default db;
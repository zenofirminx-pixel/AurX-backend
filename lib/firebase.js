import admin from "firebase-admin";

let db;

try {
  if (!admin.apps.length) {
    const key = process.env.FIREBASE_KEY;

    if (!key) {
      throw new Error("FIREBASE_KEY missing");
    }

    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(key))
    });
  }

  db = admin.firestore();

} catch (e) {
  console.error("Firebase init error:", e.message);
}

export default db;
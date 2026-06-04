import admin from "firebase-admin";

export async function verifyToken(req) {
  try {
    const token =
      req.headers.authorization?.split("Bearer ")[1];

    if (!token) return null;

    const decoded = await admin.auth().verifyIdToken(token);
    return decoded;
  } catch (e) {
    return null;
  }
}
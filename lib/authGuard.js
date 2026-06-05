import db from "./db.js";

export async function requireAuth(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/session=([^;]+)/);

  if (!match) return null;

  const sessionId = match[1];

  const session = await db.collection("sessions").doc(sessionId).get();

  if (!session.exists) return null;

  const { userId } = session.data();

  const user = await db.collection("users").doc(userId).get();

  if (!user.exists) return null;

  return {
    userId,
    user: user.data()
  };
}
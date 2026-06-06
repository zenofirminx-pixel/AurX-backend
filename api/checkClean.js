import { db } from './initMemory.js';

export default async function handler(req, res) {
  try {
    const userId = "TON_USER_ID_TEST"; // remplace temporairement

    const conv = await db.collection("conversations").doc(userId).get();
    const msgs = await db.collection("users").doc(userId).collection("messages").get();
    const mem = await db.collection("users").doc(userId).collection("memory").get();

    return res.status(200).json({
      conversations: conv.exists ? conv.data() : null,
      messagesCount: msgs.size,
      memoryCount: mem.size
    });

  } catch (e) {
    return res.status(500).json({
      error: "check failed",
      details: e.message
    });
  }
}
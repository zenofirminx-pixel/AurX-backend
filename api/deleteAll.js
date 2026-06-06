import { db } from './initMemory.js';
import { parse } from 'cookie';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://aurx.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const cookies = parse(req.headers.cookie || '');
    const session = cookies.aurx_session;

    if (!session) {
      return res.status(401).json({ error: 'No session' });
    }

    const data = JSON.parse(Buffer.from(session, 'base64').toString());
    const userId = data.sid || data.id;

    if (!userId) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // =========================
    // SAFE DELETE RULE (14 days)
    // =========================
    const limitDate = Date.now() - 14 * 24 * 60 * 60 * 1000;

    // =========================
    // 1. CLEAN OLD CONVERSATIONS ONLY
    // =========================
    const convRef = db.collection('conversations').doc(userId);
    const convSnap = await convRef.get();

    if (convSnap.exists) {
      let conversations = convSnap.data().conversations || [];

      const before = conversations.length;

      // delete only old convs
      conversations = conversations.filter(conv => {
        const time = conv.updatedAt || conv.date || 0;
        return time > limitDate;
      });

      await convRef.set({ conversations });

      console.log(`Conversations cleaned: ${before - conversations.length}`);
    }

    // =========================
    // 2. CLEAN OLD MESSAGES ONLY (NOT ALL)
    // =========================
    const messagesRef = db.collection('users').doc(userId).collection('messages');
    const snapshot = await messagesRef.get();

    const batch = db.batch();
    let deleted = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.timestamp && data.timestamp < limitDate) {
        batch.delete(doc.ref);
        deleted++;
      }
    });

    if (deleted > 0) {
      await batch.commit();
    }

    // =========================
    // RESULT
    // =========================
    return res.status(200).json({
      ok: true,
      mode: "SAFE_DELETE_14_DAYS",
      deletedConversations: true,
      deletedMessages: deleted
    });

  } catch (e) {
    console.error('SafeDelete error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
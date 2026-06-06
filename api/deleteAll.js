import { db } from './initMemory.js';
import { parse } from 'cookie';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://aurx.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // =========================
    // AUTH (NE PAS SUPPRIMER)
    // =========================
    const cookies = parse(req.headers.cookie || '');
    const session = cookies.aurx_session;

    if (!session) {
      return res.status(401).json({ error: 'No session' });
    }

    const user = JSON.parse(Buffer.from(session, 'base64').toString());
    const userId = user.google_id || user.id;

    if (!userId) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const now = Date.now();
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;

    // =========================
    // 1. CLEAN CONVERSATIONS
    // =========================
    const convRef = db.collection('conversations').doc(userId);
    const convSnap = await convRef.get();

    if (convSnap.exists) {
      let conversations = convSnap.data().conversations || [];

      // 🔥 garder seulement les récentes
      conversations = conversations.filter(conv => {
        const updated = conv.updatedAt || conv.date || 0;
        return (now - updated) < fourteenDays;
      });

      await convRef.set({ conversations });
    }

    // =========================
    // 2. CLEAN MESSAGES CONTEXT IA
    // =========================
    const messagesRef = db
      .collection('users')
      .doc(userId)
      .collection('messages');

    const snapshot = await messagesRef.get();

    const batch = db.batch();
    let deleted = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const ts = data.timestamp || 0;

      // 🔥 SUPPRESSION UNIQUEMENT +14 JOURS
      if (now - ts > fourteenDays) {
        batch.delete(doc.ref);
        deleted++;
      }
    });

    await batch.commit();

    // =========================
    // 3. MEMORY (NE PAS TOUCHER)
    // =========================
    // ❌ volontairement ignoré

    return res.status(200).json({
      ok: true,
      message: "Clean completed",
      deletedMessages: deleted
    });

  } catch (e) {
    console.error('DeleteAll error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
import { db } from './initMemory.js';
import { parse } from 'cookie';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://aurx.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    // 🔥 SAFE FIREBASE READS (IMPORTANT)
    const convRef = db.collection('conversations').doc(userId);
    const msgRef = db.collection('users').doc(userId).collection('messages');
    const memRef = db.collection('users').doc(userId).collection('memory');

    const [convSnap, msgSnap, memSnap] = await Promise.all([
      convRef.get().catch(() => null),
      msgRef.get().catch(() => null),
      memRef.get().catch(() => null)
    ]);

    return res.status(200).json({
      ok: true,
      userId,
      conversations: convSnap?.exists ? convSnap.data() : null,
      messagesCount: msgSnap?.size || 0,
      memoryCount: memSnap?.size || 0
    });

  } catch (err) {
    console.error('checkClean crash:', err);

    return res.status(500).json({
      error: 'Server crash',
      details: err.message
    });
  }
}
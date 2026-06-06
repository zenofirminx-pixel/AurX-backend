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

    // 1. Wipe les conversations pour l'UI
    await db.collection('conversations').doc(userId).set({ conversations: [] });

    // 2. Wipe les messages à plat pour l'IA
    const messagesRef = db.collection('users').doc(userId).collection('messages');
    const snapshot = await messagesRef.get();
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    
    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('DeleteAll error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
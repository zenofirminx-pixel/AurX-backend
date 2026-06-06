import { db } from './initMemory.js';
import { parse } from 'cookie';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', 'https://aurx.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const cookies = parse(req.headers.cookie || '');
    const session = cookies.aurx_session;
    
    if (!session) {
      return res.status(401).json({ conversations: [] });
    }

    let userId;
    try {
      const data = JSON.parse(Buffer.from(session, 'base64').toString());
      userId = data.sid || data.id;
    } catch (e) {
      return res.status(401).json({ conversations: [] });
    }

    if (!userId) {
      return res.status(401).json({ conversations: [] });
    }

    // Récupère les convs depuis conversations/{userId}
    const ref = db.collection('conversations').doc(userId);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(200).json({ conversations: [] });
    }

    const conversations = snap.data().conversations || [];
    
    // Trie par date décroissante, les plus récentes en premier
    conversations.sort((a, b) => (b.date || 0) - (a.date || 0));

    return res.status(200).json({ conversations });

  } catch (e) {
    console.error('History error:', e);
    return res.status(500).json({ conversations: [] });
  }
}
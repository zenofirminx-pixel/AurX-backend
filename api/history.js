import { db } from '../lib/firebase-admin.js';
import { parse } from 'cookie';

export default async function handler(req, res) {
  // CORS pour que le front puisse lire la réponse
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const cookies = parse(req.headers.cookie || '');
    if (!cookies.aurx_session) {
      return res.status(401).json({ error: 'No session', conversations: [] });
    }

    const data = JSON.parse(Buffer.from(cookies.aurx_session, 'base64').toString());
    const sessionId = data.sid;

    if (!sessionId) {
      return res.status(401).json({ error: 'Invalid session', conversations: [] });
    }

    // Récupère l'histo lié à ce sessionId
    const ref = db.collection('conversations').doc(sessionId);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(200).json({ conversations: [] });
    }

    const conversations = snap.data().conversations || [];
    return res.status(200).json({ conversations });

  } catch (e) {
    console.error('History error:', e);
    return res.status(500).json({ error: 'Server error', conversations: [] });
  }
}
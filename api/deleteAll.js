import { db } from '../lib/firebase-admin.js';
import { parse } from 'cookie';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const cookies = parse(req.headers.cookie || '');
    if (!cookies.aurx_session) {
      return res.status(401).json({ error: 'No session' });
    }

    const data = JSON.parse(Buffer.from(cookies.aurx_session, 'base64').toString());
    const sessionId = data.sid;

    if (!sessionId) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // Wipe toutes les convs de cette session
    await db.collection('conversations').doc(sessionId).set({ conversations: [] });
    
    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('DeleteAll error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
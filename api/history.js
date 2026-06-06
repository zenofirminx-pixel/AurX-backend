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
    
    // =========================
    // GOOGLE OBLIGATOIRE
    // =========================
    if (!session) {
      return res.status(200).json({ conversations: [], isLoggedIn: false });
    }

    let userId;
    try {
      const data = JSON.parse(Buffer.from(session, 'base64').toString());
      userId = data.google_id; // ← UNIQUEMENT google_id
      if (!userId) {
        return res.status(200).json({ conversations: [], isLoggedIn: false });
      }
    } catch (e) {
      return res.status(200).json({ conversations: [], isLoggedIn: false });
    }

    // =========================
    // RÉCUPÈRE LES CONVS
    // =========================
    const ref = db.collection('conversations').doc(userId);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.status(200).json({ conversations: [], isLoggedIn: true });
    }

    let conversations = snap.data().conversations || [];
    
    // =========================
    // CLEANUP - 15 JOURS
    // =========================
    const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;
    conversations = conversations.filter(c => (c.updatedAt || c.date || 0) > fifteenDaysAgo);

    // =========================
    // TRI PAR updatedAt DÉCROISSANT
    // =========================
    conversations.sort((a, b) => (b.updatedAt || b.date || 0) - (a.updatedAt || a.date || 0));

    // =========================
    // LIMIT - 50 MAX
    // =========================
    conversations = conversations.slice(0, 50);

    // Save si cleanup a viré des convs
    if (snap.data().conversations?.length !== conversations.length) {
      await ref.set({ conversations });
    }

    return res.status(200).json({ conversations, isLoggedIn: true });

  } catch (e) {
    console.error('History error:', e);
    return res.status(500).json({ conversations: [], isLoggedIn: false });
  }
}
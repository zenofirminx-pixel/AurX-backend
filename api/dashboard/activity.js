import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const getDb = () => {
  if (getApps().length) return getFirestore();
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
  return getFirestore();
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Non autorisé' });

  try {
    const db = getDb();
    const limit = parseInt(req.query.limit) || 20;
    
    const activitySnapshot = await db.collection('activity_logs')
      .limit(limit)
      .get();

    if (activitySnapshot.empty) return res.status(200).json([]);

    const activities = activitySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type || 'info',
        user: data.user || data.email || 'Système',
        action: data.action || data.message || '',
        timestamp: data.timestamp?.toDate?.() || data.timestamp || Date.now(),
        metadata: data.metadata || {}
      };
    });

    return res.status(200).json(activities);
  } catch (error) {
    console.error('Activity error:', error);
    return res.status(200).json([]);
  }
}
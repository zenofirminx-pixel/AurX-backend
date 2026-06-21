import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = {
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Vérifie le token admin
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Non autorisé' });

  try {
    const usersSnapshot = await db.collection('users')
      .orderBy('lastLogin', 'desc')
      .limit(50)
      .get();

    const users = usersSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        name: data.displayName || data.name || 'Anonyme',
        email: data.email,
        photo: data.photoURL || `https://i.pravatar.cc/40?u=${doc.id}`,
        lastLogin: data.lastLogin?.toDate?.() || data.lastLogin || null,
        messageCount: data.messageCount || 0,
        status: data.status || 'inconnu',
        langue: data.langue || data.language || 'fr'
      };
    });

    return res.status(200).json(users);
  } catch (error) {
    console.error('Firestore error:', error);
    return res.status(500).json({ error: error.message });
  }
}
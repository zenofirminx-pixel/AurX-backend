import { db } from '../../lib/firebase.js'; // Ton fichier existant

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
        lastLogin: data.lastLogin?.toDate?.() || null,
        messageCount: data.messageCount || 0,
        status: data.status || 'inconnu',
        langue: data.langue || data.language || 'fr'
      };
    });

    return res.status(200).json(users);
  } catch (error) {
    console.error('Firestore error:', error);
    return res.status(500).json({ error: 'Erreur Firestore' });
  }
}
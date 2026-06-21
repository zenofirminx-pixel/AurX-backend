export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vérifie le token via ENV
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const data = {
    totalUsers: 0,
    messagesIA: 0,
    active24h: 0,
    active7d: 0,
    growth: 0,
    totalMessages: 0,
    version: 'v1.0.0'
  };

  return res.status(200).json(data);
}
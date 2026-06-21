export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, token } = req.body;
  
  // CONFIG EN DUR - CHANGE CES VALEURS
  const ADMIN_TOKEN = 'aurx_06092008.jsx';
  const ADMIN_EMAILS = ['firminphinees@gmail.com']; // Mets ton vrai mail ici

  if (!ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Email non autorisé' });
  }
  
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Token invalide' });
  }
  
  return res.status(200).json({ success: true });
}
import { serialize } from 'cookie';
import db from '../initMemory.js'; // ton fichier Firebase admin

export default async function handler(req, res) {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send('Code OAuth manquant');
  }

  const host = req.headers.host;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const REDIRECT_URI = `${protocol}://${host}/api/auth/callback`;

  try {
    // 1. Échange le code contre un access_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenRes.json();
    
    if (!tokens.access_token) {
      throw new Error('Pas de access_token reçu de Google');
    }

    // 2. Récup les infos du user Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    
    const gUser = await userRes.json();

    // 3. Sauve/update le user dans Firestore
    const uid = `google_${gUser.id}`;
    await db.collection('users').doc(uid).set({
      id: uid,
      email: gUser.email,
      name: gUser.name,
      picture: gUser.picture,
      provider: 'google',
      lastLogin: Date.now()
    }, { merge: true });

    // 4. Crée le cookie de session
    const sessionData = JSON.stringify({
      id: uid,
      email: gUser.email,
      name: gUser.name,
      picture: gUser.picture
    });

    res.setHeader('Set-Cookie', serialize('aurx_session', sessionData, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 7 jours
    }));

    // 5. Redirect vers ton front
    res.redirect('https://aurx.vercel.app');
    
  } catch (err) {
    console.error('Erreur OAuth callback:', err);
    res.redirect('https://aurx.vercel.app?error=auth_failed');
  }
}
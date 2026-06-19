import db from '../initMemory.js'; // Ton fichier Firebase admin conservé

export default async function handler(req, res) {
  const { code } = req.query;

  // L'URL exacte de ta PWA AX Link vers laquelle on renvoie l'utilisateur
  const PWA_URL = "https://aurx.vercel.app/";

  if (!code) {
    return res.status(400).send('Code OAuth manquant');
  }

  // Calcul dynamique de l'URI de redirection selon l'hébergement (localhost ou Vercel)
  const host = req.headers.host;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const REDIRECT_URI = `${protocol}://${host}/api/auth/callback`;

  try {
    // 1. Échange le code contre un access_token auprès de Google
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

    // 2. Récupération des infos du profil Google de l'utilisateur
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const gUser = await userRes.json();

    // 3. Sauvegarde ou mise à jour de l'utilisateur dans Firebase Firestore
    const uid = `google_${gUser.id}`;
    const userData = {
      id: uid,
      email: gUser.email,
      name: gUser.name,
      picture: gUser.picture,
      provider: 'google',
      locale: gUser.locale || 'fr',
      lastLogin: Date.now()
    };

    await db.collection('users').doc(uid).set(userData, { merge: true });

    // 4. Création du Token pour ta PWA (Données légères de session)
    const sessionData = {
      id: uid,
      email: gUser.email,
      name: gUser.name,
      picture: gUser.picture,
      locale: gUser.locale || 'fr'
    };

    // Transformation en chaîne sécurisée transportable dans l'URL
    const token = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    // 5. Redirection vers ta PWA en transmettant le Token
    return res.redirect(`${PWA_URL}/?token=${token}`);

  } catch (err) {
    console.error('Erreur OAuth callback AX Link:', err);
    // En cas d'échec, renvoie l'utilisateur sur la PWA avec un paramètre d'erreur propre
    return res.redirect(`${PWA_URL}/?login=error`);
  }
}

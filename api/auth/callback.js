import db from '../initMemory.js';

export default async function handler(req, res) {
  const { code } = req.query;

  const PWA_URL = "https://aurx.vercel.app";

  if (!code) {
    return res.status(400).send('Code OAuth manquant');
  }

  const host = req.headers.host;
  const protocol = host.includes('localhost') ? 'http' : 'https';

  const REDIRECT_URI = `${protocol}://${host}/api/auth/callback`;

  try {

    // 1. Échange du code Google contre un access token
    const tokenRes = await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      }
    );

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      throw new Error('Pas de access_token reçu');
    }


    // 2. Récupération profil Google
    const userRes = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      }
    );

    const gUser = await userRes.json();


    // 3. ID AurX
    const uid = `google_${gUser.id}`;


    // 4. Sauvegarde Firestore
    const userData = {
      id: uid,
      email: gUser.email,
      name: gUser.name,
      picture: gUser.picture,
      provider: "google",
      locale: gUser.locale || "fr",
      lastLogin: Date.now()
    };


    await db
      .collection('users')
      .doc(uid)
      .set(userData, { merge: true });



    // 5. Session attendue par /api/auth/me
    const sessionData = {
      id: uid,
      email: gUser.email,
      name: gUser.name,
      picture: gUser.picture,
      provider: "google",
      locale: gUser.locale || "fr"
    };


    // Pas de base64 ici, /api/auth/me fait JSON.parse()
    const sessionToken = JSON.stringify(sessionData);


    // 6. Cookie de session AurX
    res.setHeader(
      'Set-Cookie',
      [
        `aurx_session=${encodeURIComponent(sessionToken)}`,
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=None',
        'Max-Age=2592000'
      ].join('; ')
    );


    // 7. Retour vers AurX
    return res.redirect(PWA_URL);


  } catch (err) {

    console.error(
      'Erreur OAuth callback AurX:',
      err
    );

    return res.redirect(
      `${PWA_URL}/?login=error`
    );
  }
}
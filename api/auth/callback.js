import db from '../initMemory.js';

export default async function handler(req, res) {
  const { code } = req.query;

  // Frontend AurX
  const PWA_URL = "https://aur-x.vercel.app";

  if (!code) {
    return res.status(400).send('Code OAuth manquant');
  }

  const host = req.headers.host;
  const protocol = host.includes('localhost') ? 'http' : 'https';

  const REDIRECT_URI = `${protocol}://${host}/api/auth/callback`;

  try {
    // 1. Échange code OAuth contre token Google
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


    // 2. Infos Google
    const userRes = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      }
    );

    const gUser = await userRes.json();


    // 3. ID utilisateur AurX
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



    // 5. Session AurX
    const sessionData = {
      id: uid,
      email: gUser.email,
      name: gUser.name,
      picture: gUser.picture,
      locale: gUser.locale || "fr"
    };


    const sessionToken = Buffer
      .from(JSON.stringify(sessionData))
      .toString('base64');


    // 6. Création cookie attendu par AurX
    res.setHeader(
      'Set-Cookie',
      [
        `aurx_session=${sessionToken}`,
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=None',
        'Max-Age=2592000'
      ].join('; ')
    );


    // 7. Retour PWA
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
export default async function handler(req, res) {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  
  // Récupère l’host dynamiquement : marche en local et en prod
  const host = req.headers.host;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const REDIRECT_URI = `${protocol}://${host}/api/auth/callback`;
  
  const scope = [
    'openid',
    'email',
    'profile'
  ].join(' ');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  res.redirect(authUrl.toString());
}
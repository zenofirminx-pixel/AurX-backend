export default function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({ error: "Missing GOOGLE_CLIENT_ID" });
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  const url =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    "?client_id=" + clientId +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&response_type=code" +
    "&scope=openid%20email%20profile" +
    "&access_type=offline" +
    "&prompt=consent";

  return res.redirect(url);
}
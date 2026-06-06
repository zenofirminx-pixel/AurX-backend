import { serialize } from 'cookie';

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Supprime le cookie en mettant maxAge à 0
  res.setHeader('Set-Cookie', serialize('aurx_session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 0
  }));

  res.status(200).json({ ok: true });
}
import { parse } from 'cookie';

export default async function handler(req, res) {
  // CORS pour accepter ton front
  res.setHeader("Access-Control-Allow-Origin", "https://aurx.vercel.app");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Lit le cookie
  const cookies = parse(req.headers.cookie || '');
  const session = cookies.aurx_session;

  if (!session) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    const user = JSON.parse(session);
    res.status(200).json(user);
  } catch (err) {
    res.status(401).json({ error: 'Invalid session' });
  }
}
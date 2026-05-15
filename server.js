import dotenv from 'dotenv';
dotenv.config();

const KEYS = {
  openai: process.env.OPENAI_KEY,
  gemini: process.env.GEMINI_KEY
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method!== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { api, message, model } = req.body;
    const key = KEYS[api];

    if (!key) return res.status(400).json({ error: `Clé manquante pour ${api}` });

    let url, headers, body;

    if (api === 'openai') {
      url = 'https://openrouter.ai/api/v1/chat/completions';
      headers = {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.origin || 'https://vercel.app',
        'X-Title': 'AurX AI'
      };
      body = {
        model: model || 'openai/gpt-oss-20b:free',
        messages: [{ role: 'user', content: message }]
      };
    } else if (api === 'gemini') {
      url = 'https://api.groq.com/openai/v1/chat/completions';
      headers = {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      };
      body = {
        model: model || 'llama3-8b-8192',
        messages: [{ role: 'user', content: message }]
      };
    } else {
      return res.status(400).json({ error: 'API invalide' });
    }

    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await r.json();

    console.log('Status:', r.status);
    console.log('Réponse brute:', JSON.stringify(data, null, 2));

    if (data.error) {
      return res.status(500).json({ error: data.error.message || data.error });
    }

    let reply = data.choices?.[0]?.message?.content;
    res.status(200).json({ reply: reply || 'Erreur réponse vide' });

  } catch (e) {
    console.log('Catch error:', e);
    res.status(500).json({ error: e.message });
  }
}
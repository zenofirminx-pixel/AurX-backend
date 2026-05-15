import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const KEYS = {
  openai: process.env.OPENAI_KEY,
  gemini: process.env.GEMINI_KEY
};

app.post('/chat', async (req, res) => {
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
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'MyApp'
      };
      body = {
        model: model || 'openai/gpt-oss-20b:free',
        messages: [{ role: 'user', content: message }]
      };
    }

    if (api === 'gemini') {
      url = 'https://api.groq.com/openai/v1/chat/completions';
      headers = {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      };
      body = {
        model: model || 'llama3-8b-8192',
        messages: [{ role: 'user', content: message }]
      };
    }

    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const data = await r.json();
    console.log('Status:', r.status);
    console.log('Réponse brute:', JSON.stringify(data, null, 2));

    if (data.error) {
      return res.status(500).json({ error: data.error.message || data.error });
    }

    let reply = data.choices?.[0]?.message?.content;
    res.json({ reply: reply || 'Erreur réponse vide' });

  } catch (e) {
    console.log('Catch error:', e);
    res.status(500).json({ error: e.message });
  }
});

// CORRECTION ICI : écoute sur 0.0.0.0 au lieu de localhost
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://0.0.0.0:${PORT}`));
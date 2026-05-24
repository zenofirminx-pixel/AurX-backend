import { generateSlug } from '../service/linkengine.js';

export default function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {

    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Missing text' });
    }

    const slug = generateSlug(text);

    const link = `https://aurxai.vercel.app/go/${slug}`;

    return res.status(200).json({
      success: true,
      text,
      slug,
      link
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
const {
  generateLink
} = require('../service/linkengine');

export default async function handler(req, res) {

  if (req.method !== 'POST') {

    return res.status(405).json({
      error: 'Method not allowed'
    });

  }

  try {

    const { text } = req.body;

    if (!text) {

      return res.status(400).json({
        error: 'Missing text'
      });

    }

    const link =
      generateLink(text);

    return res.status(200).json({

      success: true,
      input: text,
      link

    });

  } catch (err) {

    return res.status(500).json({
      error: err.message
    });

  }
}
import { generateLink } from "../services/linkengine.js";

export default async function handler(req, res) {

  try {

    const q = req.query.q;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Query manquante"
      });
    }

    const result = generateLink(q);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.message
      });
    }

    return res.status(200).json({
      success: true,
      name: result.name,
      url: result.url,
      text: `${result.name} 🔗 Lien généré : ${result.url}`
    });

  } catch (err) {

    console.error("LINK API ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Erreur serveur",
      error: String(err)
    });

  }

}
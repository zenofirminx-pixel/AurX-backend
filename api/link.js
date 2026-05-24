const { generateLink } = require("../services/linkengine");

module.exports = async (req, res) => {
  try {
    const q = req.query.q;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Paramètre q manquant"
      });
    }

    const result = generateLink(q);

    return res.status(200).json(result);

  } catch (err) {
    console.error("LINK API ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
};
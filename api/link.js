export default function handler(req, res) {
  try {

    const LINKS = {
      firminx: "https://firminx.vercel.app/",
      aurx: "https://aurx.vercel.app/",
      history: "https://firmin-history.vercel.app/",
      dashboard: "https://backend-dashboard-ivory.vercel.app/"
    };

    const q = String(req.query.q || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "");

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "query manquante"
      });
    }

    const url = LINKS[q];

    if (!url) {
      return res.status(404).json({
        success: false,
        message: "Lien introuvable"
      });
    }

    return res.status(200).json({
      success: true,
      name: q,
      url
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      error: String(err)
    });

  }
}
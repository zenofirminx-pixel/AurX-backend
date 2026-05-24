export default function handler(req, res) {
  const { route } = req.query;

  const LINKS = {
    github: "https://github.com",
    youtube: "https://youtube.com",
    aurx: "https://aurx.vercel.app",
    firminx: "https://firminx.vercel.app",
    neurax: "https://firmin-history.vercel.app"
  };

  const link = LINKS[route];

  if (!link) {
    return res.json({
      message: "Lien introuvable",
      route
    });
  }

  return res.json({
    message: `Voici ton lien pour ${route}`,
    url: link
  });
}
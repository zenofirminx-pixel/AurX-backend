const LINKS = {
  firmin: "https://firminx.vercel.app/",
  firminx: "https://firminx.vercel.app/",
  aurx: "https://aurx.vercel.app/",
  history: "https://firmin-history.vercel.app/",
  dashboard: "https://backend-dashboard-ivory.vercel.app/"
};

export function generateLink(query) {

  const q = String(query || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "");

  const url = LINKS[q];

  if (!url) {
    return "❌ Lien introuvable";
  }

  return `${q} 🔗 Lien généré : ${url}`;
}
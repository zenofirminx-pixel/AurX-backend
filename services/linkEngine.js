const LINKS = {
  firmin: "https://firminx.vercel.app/",
  firminx: "https://firminx.vercel.app/",
  aurx: "https://aurx.vercel.app/",
  history: "https://firmin-history.vercel.app/",
  dashboard: "https://backend-dashboard-ivory.vercel.app/"
};

export function generateLink(query) {

  const text = String(query || "")
    .toLowerCase()
    .trim();

  // Cherche si un mot-clé existe dans la phrase
  for (const key in LINKS) {

    if (text.includes(key)) {

      return `${key} 🔗 Lien généré : ${LINKS[key]}`;

    }

  }

  return "❌ Lien introuvable";
}
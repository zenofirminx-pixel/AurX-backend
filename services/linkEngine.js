export const LINKS = {
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

  if (!LINKS[q]) {
    return {
      success: false,
      message: "Lien introuvable"
    };
  }

  return {
    success: true,
    name: q,
    url: LINKS[q]
  };
}
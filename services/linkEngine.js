const LINKS = {
  firminx: "https://firminx.vercel.app/",
  aurx: "https://aurx.vercel.app/",
  history: "https://firmin-history.vercel.app/",
  dashboard: "https://backend-dashboard-ivory.vercel.app/"
};

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "");
}

function generateLink(input) {
  const key = normalize(input);

  if (LINKS[key]) {
    return {
      success: true,
      name: key,
      url: LINKS[key]
    };
  }

  return {
    success: false,
    message: "Lien introuvable"
  };
}

module.exports = {
  generateLink
};
const BASE_URL = "https://aurx.vercel.app";

// 🔗 Génère un lien simple
export function generateLink(type, id) {
  if (!type || !id) {
    return BASE_URL;
  }

  return `${BASE_URL}/${type}/${id}`;
}

// 🔗 Génère un lien court simple (optionnel)
export function generateShortLink() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return `${BASE_URL}/x/${code}`;
}
const BASE_URL = "https://aurx.vercel.app";

// 🔗 Génération de deep links
export function generateDeepLink(type, id) {
  const routes = {
    user: `${BASE_URL}/user/${id}`,
    chat: `${BASE_URL}/chat/${id}`,
    message: `${BASE_URL}/message/${id}`,
    invite: `${BASE_URL}/invite/${id}`,
    admin: `${BASE_URL}/admin/${id}`
  };

  return routes[type] || BASE_URL;
}

// 🔗 Short link simple (version future améliorée)
export function generateShortCode(length = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";

  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

// 🔗 Wrapper complet lien partagé
export function createShareLink(type, id) {
  return {
    type,
    id,
    link: generateDeepLink(type, id),
    shortCode: generateShortCode()
  };
}
const BASE_URL = "https://aurx.vercel.app";

export function generateLink(type, id) {
  return `${BASE_URL}/${type}/${id}`;
}
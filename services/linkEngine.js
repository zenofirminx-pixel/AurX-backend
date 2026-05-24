export function transformText(text) {

  let encoded = Buffer
    .from(text)
    .toString('base64');

  encoded = encoded
    .replace(/=/g, '')
    .replace(/\+/g, 'x')
    .replace(/\//g, 'z')
    .toLowerCase();

  return encoded;
}

export function generateLink(text) {

  const clean = text.trim();

  const transformed =
    transformText(clean);

  return `https://${transformed}.aurxai.vercel.app`;
}
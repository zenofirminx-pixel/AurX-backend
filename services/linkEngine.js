function transformText(text) {

  // Base64
  let encoded = Buffer
    .from(text)
    .toString('base64');

  // URL safe
  encoded = encoded
    .replace(/=/g, '')
    .replace(/\+/g, 'x')
    .replace(/\//g, 'z');

  // Minuscule
  encoded = encoded.toLowerCase();

  return encoded;
}

function generateLink(text) {

  const clean =
    text.trim();

  const transformed =
    transformText(clean);

  // Génération du lien
  return `https://${transformed}.aurx`;

}

module.exports = {
  generateLink
};
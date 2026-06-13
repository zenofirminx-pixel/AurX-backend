const WEB_KEYWORDS = [
  "aujourd'hui",
  "actuellement",
  "maintenant",
  "en ce moment",
  "dernier",
  "dernière",
  "actualité",
  "actualités",
  "news",
  "prix",
  "cours",
  "météo",
  "résultat",
  "score",
  "président actuel"
];

export function shouldUseWeb(message = "") {
  const text = message.toLowerCase();

  return WEB_KEYWORDS.some(word =>
    text.includes(word)
  );
}
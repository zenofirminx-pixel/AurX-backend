import { googleSearch } from "./googleSearch.js";
import { wikipediaSearch } from "./wikipediaSearch.js";
import { githubSearch } from "./githubSearch.js";

/**
 * 🌐 WEB INTENT DETECTION (FR + EN + sources)
 * → uniquement pour temps réel + sources externes
 */
const WEB_INTENT_PATTERNS = [
  // 🔍 recherche explicite
  "recherche", "rechercher", "search", "look up", "find", "browse",

  // 🌐 internet global
  "sur internet", "on the internet", "web", "online",

  // ⚡ temps réel
  "actualité", "news", "breaking", "latest", "now", "live", "en ce moment", "today",

  // 📊 data dynamique
  "prix", "price", "cost", "crypto", "bitcoin", "market",
  "météo", "weather",
  "score", "match", "résultat", "result",

  // 💻 GitHub / dev
  "github", "repo", "repository", "code source", "open source",
  "release", "version", "commit",

  // 📚 Wikipedia
  "wikipedia", "wiki", "encyclopedia", "encyclopédie",

  // 🔎 Google
  "google", "search google", "via google",

  // ⚙️ dev / docs
  "api", "documentation", "docs", "framework", "library", "package"
];

/**
 * 🧠 détecte si le web est nécessaire
 */
export function shouldUseWeb(query) {
  const q = query.toLowerCase();

  // 🔥 match mots-clés
  const hasTrigger = WEB_INTENT_PATTERNS.some(word =>
    q.includes(word)
  );

  // 🔥 requêtes directes courtes
  const directSourceRequest =
    q === "github" ||
    q === "google" ||
    q === "wikipedia";

  // ❓ recherche explicite
  const explicitSearch =
    q.startsWith("recherche") ||
    q.startsWith("search") ||
    q.startsWith("find") ||
    q.startsWith("look up");

  return hasTrigger || directSourceRequest || explicitSearch;
}

/**
 * 🧠 résumé intelligent façon ChatGPT
 */
function summarizeResults(query, results) {
  const clean = results.slice(0, 8);

  return {
    title: `Résultats web pour : ${query}`,
    summary: "Voici ce que j'ai trouvé sur le web :",
    results: clean.map((r) => ({
      title: r.title,
      info: r.snippet || r.description || "Aucune description disponible",
      link: r.link || null,
      stars: r.stars || null
    }))
  };
}

/**
 * 🌐 WEB BRAIN PRINCIPAL
 */
export async function WebBrain(query) {

  // ❌ pas besoin du web
  if (!shouldUseWeb(query)) {
    return {
      usedWeb: false,
      query,
      message: "Base de connaissances utilisée (pas de web nécessaire)"
    };
  }

  // ⚡ appels parallèles
  const [google, wiki, github] = await Promise.all([
    googleSearch(query),
    wikipediaSearch(query),
    githubSearch(query)
  ]);

  // 🔗 fusion des résultats
  const merged = [
    ...(wiki.results || []),
    ...(google.results || []),
    ...(github.results || [])
  ];

  // 🧠 réponse finale résumée
  const summary = summarizeResults(query, merged);

  return {
    usedWeb: true,
    query,
    sources: {
      google,
      wikipedia: wiki,
      github
    },
    ...summary
  };
}
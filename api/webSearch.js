export default async function handler(req, res) {
  try {
    const query = req.body?.query;

    if (!query) {
      return res.status(400).json({ error: "Missing query" });
    }

    // =========================
    // 1. GOOGLE SEARCH (via Custom Search API)
    // =========================
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    const GOOGLE_CX = process.env.GOOGLE_CX;

    let googleResults = [];

    if (GOOGLE_API_KEY && GOOGLE_CX) {
      const googleUrl =
        `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}`;

      const googleRes = await fetch(googleUrl);
      const googleData = await googleRes.json();

      googleResults =
        googleData.items?.slice(0, 3).map(item => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet
        })) || [];
    }

    // =========================
    // 2. WIKIPEDIA SEARCH (fallback / complément)
    // =========================
    const wikiUrl =
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;

    let wikiData = null;

    try {
      const wikiRes = await fetch(wikiUrl);
      wikiData = await wikiRes.json();
    } catch {}

    const wikipedia = wikiData?.extract
      ? {
          title: wikiData.title,
          extract: wikiData.extract,
          url: wikiData.content_urls?.desktop?.page
        }
      : null;

    // =========================
    // RESPONSE CLEAN
    // =========================
    return res.status(200).json({
      query,
      google: googleResults,
      wikipedia
    });

  } catch (err) {
    return res.status(500).json({
      error: "Search failed",
      details: err.message
    });
  }
}
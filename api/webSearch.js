export default async function handler(req, res) {
  try {
    const query = req.body?.query;

    if (!query) {
      return res.status(400).json({ error: "Missing query" });
    }

    // =========================
    // API SEARCH (simple via DuckDuckGo instant answer API)
    // =========================
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

    const response = await fetch(url);
    const data = await response.json();

    // =========================
    // EXTRACTION SIMPLE
    // =========================
    const result = {
      answer: data.AbstractText || "",
      source: data.AbstractURL || "",
      title: data.Heading || query
    };

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({
      error: "Web search failed",
      details: err.message
    });
  }
}
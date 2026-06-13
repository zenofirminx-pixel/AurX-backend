export async function googleSearch(query) {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`
    );

    const data = await res.json();

    return {
      source: "google_like_duckduckgo",
      results: data.RelatedTopics?.slice(0, 5).map((item) => ({
        title: item.Text,
        link: item.FirstURL
      })) || []
    };

  } catch (err) {
    return {
      source: "google_like_duckduckgo",
      error: true,
      results: []
    };
  }
}
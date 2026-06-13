const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

export async function googleSearch(query) {

  try {

    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": BRAVE_API_KEY
        }
      }
    );

    const data = await res.json();

    return {
      source: "Search",
      results: (data.web?.results || [])
        .slice(0, 5)
        .map(item => ({
          title: item.title,
          description: item.description,
          url: item.url
        }))
    };

  } catch (err) {
    return {
      source: "Search",
      error: err.message
    };
  }
}
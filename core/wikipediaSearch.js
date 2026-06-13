// core/wikipediaSearch.js

export async function wikipediaSearch(query) {
  try {
    const url =
      `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error("Page non trouvée");
    }

    const data = await res.json();

    return {
      source: "Wikipedia",
      title: data.title,
      summary: data.extract,
      url: data.content_urls?.desktop?.page || ""
    };

  } catch (err) {
    return {
      source: "Wikipedia",
      error: err.message
    };
  }
}
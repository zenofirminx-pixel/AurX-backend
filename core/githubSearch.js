export async function githubSearch(query) {
  try {

    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc`
    );

    const data = await res.json();

    return {
      source: "GitHub",
      results: (data.items || [])
        .slice(0, 5)
        .map(repo => ({
          name: repo.full_name,
          description: repo.description,
          stars: repo.stargazers_count,
          url: repo.html_url
        }))
    };

  } catch (err) {
    return {
      source: "GitHub",
      error: err.message
    };
  }
}
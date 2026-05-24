export default function handler(req, res) {

  const { slug } = req.query;

  const routes = {

    github: 'https://github.com',
    youtube: 'https://youtube.com',
    google: 'https://google.com'

  };

  if (routes[slug]) {
    return res.redirect(routes[slug]);
  }

  // fallback intelligent
  return res.redirect(
    `https://www.google.com/search?q=${slug}`
  );
}
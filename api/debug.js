export default function handler(req, res) {
  console.log("DEBUG API HIT");

  res.status(200).json({
    ok: true,
    message: "API détectée par Vercel",
    time: new Date().toISOString(),
    method: req.method,
    url: req.url
  });
}
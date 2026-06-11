export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "text/plain");

  res.status(200).send("OK BACKEND CONNECTED");
}
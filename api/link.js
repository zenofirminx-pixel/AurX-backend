import { generateLink } from "./linkEngine.js";

export default function handler(req, res) {
  const { type, id } = req.query;

  if (!type || !id) {
    return res.status(400).json({ error: "missing params" });
  }

  const link = generateLink(type, id);

  res.status(200).json({ link });
}
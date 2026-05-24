import { generateLink } from "../services/linkengine.js";

export default function handler(req, res) {

  try {

    const q = req.query.q;

    if (!q) {
      return res.status(400).send("Query manquante");
    }

    const result = generateLink(q);

    return res.status(200).send(result);

  } catch (err) {

    return res.status(500).send("Erreur serveur");

  }

}
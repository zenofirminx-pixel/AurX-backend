import { generateLink } from "../services/linkengine.js";

export default function handler(req, res) {

  try {

    const result = generateLink(req.query.q);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);

  } catch (err) {

    return res.status(500).json({
      success: false,
      error: String(err)
    });

  }

}
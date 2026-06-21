export default function handler(req, res) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "No authorization header"
      });
    }

    const token = authHeader.split(" ")[1];

    const ADMIN_EMAIL = "firminphinees@gmail.com";
    const ADMIN_TOKEN = "aurx_06092008";

    const { email } = req.body || {};

    if (!token || !email) {
      return res.status(401).json({
        success: false,
        message: "Missing email or token"
      });
    }

    if (email !== ADMIN_EMAIL || token !== ADMIN_TOKEN) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized"
      });
    }

    return res.status(200).json({
      success: true,
      role: "admin",
      message: "Access granted"
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
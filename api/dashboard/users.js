export default function handler(req, res) {
  console.log("🔥 USERS HIT");

  return res.status(200).json({
    ok: true,
    test: "users route alive"
  });
}
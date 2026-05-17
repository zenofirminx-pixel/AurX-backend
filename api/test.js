export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    message: "API Vercel fonctionne parfaitement 🚀"
  });
}
console.log("ENV KEYS RAW:", {
  k1: process.env.OPENAI_API_KEY_1,
  k2: process.env.OPENAI_API_KEY_2,
  k3: process.env.OPENAI_API_KEY_3,
  k4: process.env.OPENAI_API_KEY_4
});
export default function handler(req, res) {
  const start = Date.now();

  res.status(200).json({
    status: "ok",
    service: "AurX Backend",
    uptime: process.uptime(),
    latency: Date.now() - start,
    timestamp: new Date().toISOString()
  });
}
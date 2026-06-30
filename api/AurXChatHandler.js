import { AurXEngine } from "../aurx_core/AurXEngine.js";

export const config = { maxDuration: 60 };

export default async function AurXChatHandler(req, res) {
  const engine = new AurXEngine(req, res);
  await engine.run();
}
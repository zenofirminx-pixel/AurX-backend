import { AurXEngine } from "../aurx_core/AurXEngine.js";

export default async function handler(req, res) {
    return AurXEngine.run(req, res);
}
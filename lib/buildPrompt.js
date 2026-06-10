import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

let cachedPrompt = null;

export function buildPrompt() {
  try {
    if (cachedPrompt) {
      return cachedPrompt;
    }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const promptPath = path.join(
      __dirname,
      "prompt",
      "Aurx.txt"
    );

    cachedPrompt = fs.readFileSync(promptPath, "utf8").trim();

    return cachedPrompt;
  } catch (error) {
    console.error("[PROMPT] Error loading Aurx.txt:", error);

    return "You are AurX.";
  }
}

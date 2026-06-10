import fs from "fs";

const prompt = fs.readFileSync(
  new URL("../prompt/Aurx.txt", import.meta.url),
  "utf-8"
);

export function buildPrompt() {
  return prompt;
}

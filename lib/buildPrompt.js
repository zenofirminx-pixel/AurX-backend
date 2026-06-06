import fs from "fs";
import path from "path";

// =========================
// LOAD MODULES FROM /lib/prompt
// =========================
function load(file) {
  return fs.readFileSync(
    path.join(process.cwd(), "lib", "prompt", file),
    "utf-8"
  );
}

// =========================
// PROMPT BUILDER
// =========================
export function buildPrompt(message) {

  const systemPrompt = [
    load("identity.txt"),
    load("behavior.txt"),
    load("source.txt"),
    load("style.txt")
  ].join("\n\n");

  return [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: message
    }
  ];
}
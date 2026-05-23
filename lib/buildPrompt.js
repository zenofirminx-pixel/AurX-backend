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
    load("core_identity.txt"),
    load("core_behavior.txt"),
    load("architecture.txt"),
    load("memory_policy.txt"),
    load("founder_story.txt"),
    load("style.txt"),
    load("response_format.txt"),
    load("conversation_mode.txt"),
    load("emojis_system.txt")
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
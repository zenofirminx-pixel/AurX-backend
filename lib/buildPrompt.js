import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROMPT_DIR = path.join(__dirname, "prompt");

// 🎯 ordre de priorité (IMPORTANT)
const PRIORITY = [
  "identity.txt",
  "rules.txt",
  "style.txt",
  "memory.txt"
];

let cache = null;

function readFile(file) {
  const filePath = path.join(PROMPT_DIR, file);
  return fs.readFileSync(filePath, "utf8").trim();
}

function buildEnginePrompt() {
  const availableFiles = fs.readdirSync(PROMPT_DIR);

  const ordered = [];

  // 1. fichiers prioritaires
  for (const file of PRIORITY) {
    if (availableFiles.includes(file)) {
      ordered.push(readFile(file));
    }
  }

  // 2. autres fichiers non listés
  const extras = availableFiles.filter(
    (f) => f.endsWith(".txt") && !PRIORITY.includes(f)
  );

  for (const file of extras.sort()) {
    ordered.push(readFile(file));
  }

  return ordered.join("\n\n---\n\n");
}

export function buildPrompt() {
  if (cache) return cache;

  try {
    const prompt = buildEnginePrompt();

    if (!prompt || prompt.length < 20) {
      throw new Error("Prompt empty or too small");
    }

    cache = prompt;
    return cache;
  } catch (err) {
    console.error("[buildPrompt ERROR]", err);

    cache = "You are AurX. Respond clearly and concisely.";
    return cache;
  }
}
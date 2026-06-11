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

// FIX: accepte userMemory en param
export function buildPrompt(userMemory = {}) {
  const { name, identity, facts, preferences } = userMemory;
  
  // On rebuild à chaque fois si y'a une mémoire user, sinon on cache
  const hasUserMemory = name || identity.length > 0 || facts.length > 0 || preferences.length > 0;
  if (cache && !hasUserMemory) return cache;

  try {
    const basePrompt = buildEnginePrompt();

    if (!basePrompt || basePrompt.length < 20) {
      throw new Error("Prompt empty or too small");
    }

    // INJECTION DE LA MÉMOIRE USER EN HAUT DU PROMPT
    let memorySection = "";
    
    if (name) {
      memorySection += `CRITICAL CONTEXT: The user's name is ${name}. You MUST remember this and address them by name when appropriate.\n\n`;
    }

    if (identity.length > 0) {
      memorySection += `User identity: ${identity.join(", ")}.\n\n`;
    }

    if (facts.length > 0) {
      memorySection += `Key facts about the user: ${facts.slice(0, 5).join(", ")}.\n\n`;
    }

    if (preferences.length > 0) {
      memorySection += `User preferences: ${preferences.slice(0, 3).join(", ")}. Adapt your responses to match.\n\n`;
    }

    // On met la mémoire AVANT le prompt de base pour que GPT la voie en premier
    const finalPrompt = memorySection ? `${memorySection}---\n\n${basePrompt}` : basePrompt;

    // Cache que si pas de mémoire user dynamique
    if (!hasUserMemory) {
      cache = finalPrompt;
    }
    
    return finalPrompt;
  } catch (err) {
    console.error("[buildPrompt ERROR]", err);
    return "You are AurX. Respond clearly and concisely.";
  }
}
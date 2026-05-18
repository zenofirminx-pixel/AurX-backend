export async function extractMemory(message) {
  const text = message.toLowerCase();

  const memory = {};

  // ======================
  // NAME DETECTION
  // ======================
  const nameMatch =
    message.match(/je m'appelle\s+([a-zA-ZÀ-ÿ'-]+)/i) ||
    message.match(/my name is\s+([a-zA-ZÀ-ÿ'-]+)/i);

  if (nameMatch && nameMatch[1]) {
    memory.name = nameMatch[1].trim();
  }

  // ======================
  // INTEREST DETECTION
  // ======================
  const likesMatch =
    message.match(/j'aime\s+(.+)/i) ||
    message.match(/i like\s+(.+)/i);

  if (likesMatch && likesMatch[1]) {
    memory.likes = likesMatch[1]
      .split(",")
      .map(i => i.trim())
      .filter(Boolean);
  }

  // ======================
  // LANGUAGE DETECTION
  // ======================
  if (text.includes("je parle anglais")) {
    memory.language = "english";
  } else if (text.includes("je parle français")) {
    memory.language = "french";
  }

  // ======================
  // IMPORTANT FIX
  // ======================
  if (Object.keys(memory).length === 0) {
    return null; // au lieu de {}
  }

  return memory;
}
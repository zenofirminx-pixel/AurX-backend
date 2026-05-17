export async function extractMemory(message) {
  const text = message.toLowerCase();

  const memory = {};

  // ======================
  // NAME DETECTION
  // ======================
  const nameMatch =
    text.match(/je m'appelle (.+)/i) ||
    text.match(/my name is (.+)/i);

  if (nameMatch) {
    memory.name = nameMatch[1].trim();
  }

  // ======================
  // INTEREST DETECTION
  // ======================
  const likesMatch =
    text.match(/j'aime (.+)/i) ||
    text.match(/i like (.+)/i);

  if (likesMatch) {
    memory.likes = likesMatch[1]
      .split(",")
      .map(i => i.trim())
      .filter(Boolean);
  }

  // ======================
  // OPTIONAL: LANGUAGE
  // ======================
  if (text.includes("je parle anglais")) {
    memory.language = "english";
  }

  if (text.includes("je parle français")) {
    memory.language = "french";
  }

  return memory;
}
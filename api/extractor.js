export async function extractMemory(message) {
  const memory = {};

  const lower = message.toLowerCase();

  // =========================
  // EXTRACTION NOM
  // =========================
  const nameMatch =
    message.match(/je m'appelle\s+([a-zA-ZÀ-ÿ]+)/i) ||
    message.match(/mon nom est\s+([a-zA-ZÀ-ÿ]+)/i);

  if (nameMatch) {
    memory.nom = nameMatch[1];
  }

  // =========================
  // EXTRACTION LANGUE
  // =========================
  if (lower.includes("anglais")) {
    memory.langue = "anglais";
  }

  if (lower.includes("français")) {
    memory.langue = "français";
  }

  // =========================
  // EXTRACTION GOÛTS
  // =========================
  const likes = [];

  if (lower.includes("ia")) {
    likes.push("IA");
  }

  if (lower.includes("programmation")) {
    likes.push("programmation");
  }

  if (lower.includes("jeux")) {
    likes.push("jeux");
  }

  if (likes.length > 0) {
    memory.likes = likes;
  }

  return memory;
}
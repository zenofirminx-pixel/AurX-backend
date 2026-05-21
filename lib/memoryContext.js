export function buildMemoryContext(memory) {
  if (!memory) return "";

  let context = "";

  if (memory.nom) {
    context += `Nom utilisateur: ${memory.nom}\n`;
  }

  if (memory.likes?.length) {
    context += `Intérêts: ${memory.likes.join(", ")}\n`;
  }

  if (memory.langue) {
    context += `Langue: ${memory.langue}\n`;
  }

  return context.trim();
}
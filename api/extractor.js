export async function extractMemory(message) {
  const text = message.toLowerCase();

  let memory = {};

  // 🧠 détection du nom
  if (text.includes("je m'appelle") || text.includes("je suis")) {
    const nameMatch = message.match(/je m'appelle (.+)|je suis (.+)/i);
    if (nameMatch) {
      memory.nom = (nameMatch[1] || nameMatch[2]).trim();
    }
  }

  // 🌍 détection langue
  if (text.includes("anglais")) {
    memory.langue = "en";
  } else if (text.includes("français") || text.includes("francais")) {
    memory.langue = "fr";
  }

  // ❤️ intérêts simples
  const interests = [];

  if (text.includes("j'aime")) {
    const likeMatch = message.match(/j'aime (.+)/i);
    if (likeMatch) {
      interests.push(likeMatch[1].trim());
    }
  }

  if (interests.length > 0) {
    memory.likes = interests;
  }

  // 🔥 si rien trouvé
  if (Object.keys(memory).length === 0) {
    return null;
  }

  return memory;
}
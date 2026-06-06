export function extractMemory(message) {
  const text = message.toLowerCase().trim();

  const memories = [];

  // =========================
  // HELPER
  // =========================
  function extractAfter(keyword) {
    const index = text.indexOf(keyword);

    if (index === -1) return null;

    return message
      .substring(index + keyword.length)
      .trim();
  }

  // =========================
  // 🔵 IDENTITÉ
  // =========================
  if (text.includes("je m'appelle")) {
    const value = extractAfter("je m'appelle");

    if (value) {
      memories.push({
        type: "identity",
        key: "name",
        value,
        importance: 10
      });
    }
  }

  // =========================
  // 🟢 PREFERENCES
  // =========================
  if (text.includes("j'aime")) {
    const value = extractAfter("j'aime");

    if (value) {
      memories.push({
        type: "preference",
        key: "like",
        value,
        importance: 7
      });
    }
  }

  if (text.includes("je déteste")) {
    const value = extractAfter("je déteste");

    if (value) {
      memories.push({
        type: "preference",
        key: "dislike",
        value,
        importance: 7
      });
    }
  }

  // =========================
  // 🟣 OBJECTIFS
  // =========================
  if (text.includes("je veux")) {
    const value = extractAfter("je veux");

    if (value) {
      memories.push({
        type: "goal",
        key: "goal",
        value,
        importance: 8
      });
    }
  }

  // =========================
  // 🟠 PROJETS
  // =========================
  if (text.includes("je travaille sur")) {
    const value = extractAfter("je travaille sur");

    if (value) {
      memories.push({
        type: "project",
        key: "project",
        value,
        importance: 9
      });
    }
  }

  if (text.includes("je crée")) {
    const value = extractAfter("je crée");

    if (value) {
      memories.push({
        type: "project",
        key: "project",
        value,
        importance: 9
      });
    }
  }

  // =========================
  // 🧠 COMMANDE EXPLICITE
  // =========================
  if (
    text.includes("mémorise ça") ||
    text.includes("aurx retiens") ||
    text.includes("souviens-toi")
  ) {
    const cleaned = message
      .replace(/mémorise ça/gi, "")
      .replace(/aurx retiens/gi, "")
      .replace(/souviens-toi/gi, "")
      .trim();

    if (cleaned) {
      memories.push({
        type: "explicit",
        key: "user_request",
        value: cleaned,
        importance: 10
      });
    }
  }

  return memories;
}
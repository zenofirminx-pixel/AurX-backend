export function extractMemory(message) {
  const text = message.toLowerCase().trim();

  const memories = [];

  // =========================
  // 🔵 IDENTITÉ
  // =========================
  if (text.includes("je m'appelle")) {
    const name = message.split("je m'appelle")[1]?.trim();
    if (name) {
      memories.push({
        type: "identity",
        key: "name",
        value: name,
        importance: 10
      });
    }
  }

  // =========================
  // 🟢 PREFERENCES
  // =========================
  if (text.includes("j'aime")) {
    const value = message.split("j'aime")[1]?.trim();
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
    const value = message.split("je déteste")[1]?.trim();
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
    const value = message.split("je veux")[1]?.trim();
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
  if (text.includes("je travaille sur") || text.includes("je crée")) {
    const value =
      message.includes("je travaille sur")
        ? message.split("je travaille sur")[1]?.trim()
        : message.split("je crée")[1]?.trim();

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
    memories.push({
      type: "explicit",
      key: "user_request",
      value: message.replace(/mémorise ça|aurx retiens|souviens-toi/gi, "").trim(),
      importance: 10
    });
  }

  // =========================
  // ❌ RIEN À STOCKER
  // =========================
  return memories;
}
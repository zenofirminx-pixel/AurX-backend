const memoryStore = {};

/**
 * 🔍 Récupérer la mémoire d’un utilisateur
 */
export function getMemory(userId) {
  if (!userId) return {};

  if (!memoryStore[userId]) {
    memoryStore[userId] = {
      name: null,
      likes: [],
      language: null,
      notes: []
    };
  }

  return memoryStore[userId];
}

/**
 * 💾 Mettre à jour la mémoire utilisateur
 */
export function updateMemory(userId, newData) {
  if (!userId || !newData) return;

  if (!memoryStore[userId]) {
    memoryStore[userId] = {
      name: null,
      likes: [],
      language: null,
      notes: []
    };
  }

  const current = memoryStore[userId];

  // ======================
  // NAME
  // ======================
  if (newData.name) {
    current.name = newData.name;
  }

  // ======================
  // LANGUAGE
  // ======================
  if (newData.language) {
    current.language = newData.language;
  }

  // ======================
  // LIKES (merge propre)
  // ======================
  if (newData.likes) {
    current.likes = [
      ...new Set([
        ...(current.likes || []),
        ...newData.likes
      ])
    ];
  }

  // ======================
  // NOTES (future AI learning)
  // ======================
  if (newData.notes) {
    current.notes.push(...newData.notes);
  }

  memoryStore[userId] = current;

  return current;
}
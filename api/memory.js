const memoryStore = {};

// =========================
// GET MEMORY
// =========================
export async function getMemory(userId) {
  return memoryStore[userId] || {
    chat: [],
    nom: null,
    likes: [],
    langue: "fr"
  };
}

// =========================
// UPDATE MEMORY
// =========================
export async function updateMemory(userId, newData) {
  const current = memoryStore[userId] || {
    chat: [],
    nom: null,
    likes: [],
    langue: "fr"
  };

  memoryStore[userId] = {
    ...current,
    ...newData
  };
}
const memoryStore = {};

// =========================
// GET MEMORY
// =========================
export async function getMemory(userId) {
  return memoryStore[userId] || {
    nom: null,
    likes: [],
    langue: "fr",
    chat: []
  };
}

// =========================
// UPDATE MEMORY
// =========================
export async function updateMemory(userId, newData) {
  const current = memoryStore[userId] || {
    nom: null,
    likes: [],
    langue: "fr",
    chat: []
  };

  memoryStore[userId] = {
    ...current,
    ...newData
  };
}
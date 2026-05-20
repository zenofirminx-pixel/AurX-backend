const memoryStore = {};

export async function getMemory(userId) {
  return memoryStore[userId] || {};
}

export async function updateMemory(userId, newData) {
  memoryStore[userId] = {
    ...(memoryStore[userId] || {}),
    ...newData
  };
}
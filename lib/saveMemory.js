export async function saveMemory(db, userId, memories) {
  if (!memories || memories.length === 0) return;

  const batch = db.batch();

  memories.forEach(mem => {
    const ref = db
      .collection("users")
      .doc(userId)
      .collection("memory")
      .doc();

    batch.set(ref, {
      ...mem,
      createdAt: Date.now(),
      lastUsed: null
    });
  });

  await batch.commit();
}
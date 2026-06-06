export async function saveMemory(db, userId, memories) {
  if (!memories || memories.length === 0) return;

  const batch = db.batch();

  memories.forEach(mem => {

    // clé unique par type + key
    const docId = `${mem.type}_${mem.key}`;

    const ref = db
      .collection("users")
      .doc(userId)
      .collection("memory")
      .doc(docId);

    batch.set(
      ref,
      {
        ...mem,
        updatedAt: Date.now()
      },
      { merge: true }
    );
  });

  await batch.commit();
}
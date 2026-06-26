export async function saveMessage(db, userId, data) {
  const ref = db.collection("users").doc(userId).collection("messages");
  return await ref.add(data);
}

export async function getHistory(db, userId, convId) {
  const ref = db.collection("users").doc(userId).collection("messages");

  const snap = await ref.where("convId", "==", convId).get();

  let history = snap.docs
    .map(d => d.data())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(m => ({
      role: m.role,
      content: m.text
    }));

  return history.slice(-19);
}
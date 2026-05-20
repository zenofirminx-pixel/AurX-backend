const BASE_URL = "https://api.jsonbin.io/v3/b";
const BIN_ID = process.env.JSONBIN_ID;
const API_KEY = process.env.JSONBIN_KEY;

async function fetchBin() {
  const res = await fetch(`${BASE_URL}/${BIN_ID}/latest`, {
    headers: {
      "X-Master-Key": API_KEY
    }
  });

  const data = await res.json();
  return data.record || {};
}

export async function getMemory(userId) {
  const record = await fetchBin();
  return record[userId] || {};
}

export async function updateMemory(userId, newData) {
  const record = await fetchBin();

  const updated = {
    ...record,
    [userId]: {
      ...(record[userId] || {}),
      ...newData
    }
  };

  await fetch(`${BASE_URL}/${BIN_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": API_KEY
    },
    body: JSON.stringify(updated)
  });
}
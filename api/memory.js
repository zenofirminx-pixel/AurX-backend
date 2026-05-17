import fs from "fs";
import path from "path";

const filePath = path.resolve("./data/memory.json");

// lire mémoire
export function getMemory(userId) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return data[userId] || null;
}

// sauvegarder mémoire
export function saveMemory(userId, newData) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  data[userId] = {
    ...data[userId],
    ...newData
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
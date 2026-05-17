import fs from "fs";
import path from "path";

const filePath = path.resolve("./data/memory.json");

export function getMemory(userId) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return data[userId] || {};
}

export function updateMemory(userId, newMemory) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  data[userId] = {
    ...data[userId],
    ...newMemory
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
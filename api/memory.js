import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function getMemory(userId) {
  const data = await redis.get(`memory:${userId}`);
  return data || { chat: [] };
}

export async function updateMemory(userId, newData) {
  const current = (await redis.get(`memory:${userId}`)) || { chat: [] };

  const updated = {
    ...current,
    ...newData,
  };

  await redis.set(`memory:${userId}`, updated);
}
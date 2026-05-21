import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function getMemory(userId) {
  return (await redis.get(`memory:${userId}`)) || {};
}

export async function updateMemory(userId, newData) {
  const current = (await redis.get(`memory:${userId}`)) || {};

  await redis.set(`memory:${userId}`, {
    ...current,
    ...newData
  });
}
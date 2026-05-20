import { kv } from '@vercel/kv';

export async function getMemory(userId) {
  return (await kv.get(`memory:${userId}`)) || {};
}

export async function updateMemory(userId, newData) {
  const current = (await kv.get(`memory:${userId}`)) || {};

  await kv.set(`memory:${userId}`, {
    ...current,
    ...newData
  });
}
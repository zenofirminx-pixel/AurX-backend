import { supabase } from "./supabase.js";

export async function getMemory(userId) {
  if (!userId) {
    return {
      userId: "guest",
      name: null,
      likes: [],
      language: null,
      notes: []
    };
  }

  const { data, error } = await supabase
    .from("memory")
    .select("*")
    .eq("userId", userId)
    .single();

  if (error || !data) {
    return {
      userId,
      name: null,
      likes: [],
      language: null,
      notes: []
    };
  }

  return data;
}

export async function updateMemory(userId, newData) {
  if (!userId || !newData) return;

  const current = await getMemory(userId);

  const updated = {
    userId,

    name: newData.name ?? current.name,
    language: newData.language ?? current.language,

    likes: Array.from(new Set([
      ...(current.likes || []),
      ...(newData.likes || [])
    ])),

    notes: Array.from(new Set([
      ...(current.notes || []),
      ...(newData.notes || [])
    ]))
  };

  await supabase
    .from("memory")
    .upsert(updated, { onConflict: "userId" });

  return updated;
}
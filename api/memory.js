import { supabase } from "./supabase.js";

/**
 * 🔍 GET MEMORY
 */
export async function getMemory(userId) {
  if (!userId) return {};

  const { data, error } = await supabase
    .from("memory")
    .select("*")
    .eq("userId", userId)
    .single();

  if (error || !data) {
    return {
      name: null,
      likes: [],
      language: null,
      notes: []
    };
  }

  return data;
}

/**
 * 💾 UPDATE MEMORY
 */
export async function updateMemory(userId, newData) {
  if (!userId || !newData) return;

  const current = await getMemory(userId);

  const updated = {
    userId,

    name: newData.name ?? current.name,
    language: newData.language ?? current.language,

    likes: [
      ...new Set([
        ...(current.likes || []),
        ...(newData.likes || [])
      ])
    ],

    notes: [
      ...(current.notes || []),
      ...(newData.notes || [])
    ]
  };

  const { error } = await supabase
    .from("memory")
    .upsert(updated);

  if (error) {
    console.log("Supabase memory error:", error);
  }

  return updated;
}
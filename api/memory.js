import { supabase } from "./supabase.js";

export async function getMemory(userId) {
  if (!userId) {
    return {
      userId: "guest",
      nom: null,
      likes: [],
      langue: null,
      notes: [],
      chat: []
    };
  }

  const { data, error } = await supabase
    .from("memory")
    .select("*")
    .eq("userId", userId)
    .maybeSingle(); // ✅ FIX IMPORTANT

  if (error || !data) {
    return {
      userId,
      nom: null,
      likes: [],
      langue: null,
      notes: [],
      chat: []
    };
  }

  return data;
}

export async function updateMemory(userId, newData) {
  if (!userId || !newData) return;

  const current = await getMemory(userId);

  const updated = {
    userId,

    // ✅ FIX: cohérence avec ton prompt
    nom: newData.nom ?? current.nom,
    langue: newData.langue ?? current.langue,

    likes: Array.from(new Set([
      ...(current.likes || []),
      ...(newData.likes || [])
    ])),

    notes: Array.from(new Set([
      ...(current.notes || []),
      ...(newData.notes || [])
    ])),

    chat: [
      ...(current.chat || []),
      ...(newData.chat || [])
    ]
  };

  const { error } = await supabase
    .from("memory")
    .upsert(updated, { onConflict: "userId" });

  if (error) {
    console.log("UPDATE MEMORY ERROR:", error);
  }

  return updated;
}
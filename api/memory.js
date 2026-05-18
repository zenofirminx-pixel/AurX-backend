import { supabase } from "./supabase.js";

/**
 * 🔍 Récupérer la mémoire utilisateur
 */
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
    .maybeSingle();

  if (error) {
    console.log("❌ getMemory error:", error.message);
  }

  if (!data) {
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

/**
 * 💾 Mettre à jour la mémoire utilisateur
 */
export async function updateMemory(userId, newData) {
  if (!userId || !newData) return;

  // ❌ ignore empty updates
  if (Object.keys(newData).length === 0) return;

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

  const { data, error } = await supabase
    .from("memory")
    .upsert(updated, {
      onConflict: "userId"
    })
    .select();

  if (error) {
    console.log("❌ Supabase memory error:", error.message);
  } else {
    console.log("✅ Memory updated:", data);
  }

  return updated;
}
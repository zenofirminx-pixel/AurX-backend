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
    .eq("userId", userId);

  // Si pas de données ou erreur → création mémoire vide
  if (error || !data || data.length === 0) {
    return {
      userId,
      name: null,
      likes: [],
      language: null,
      notes: []
    };
  }

  return data[0];
}

/**
 * 💾 Mettre à jour la mémoire utilisateur
 */
export async function updateMemory(userId, newData) {
  if (!userId || !newData) return;

  const current = await getMemory(userId);

  const updated = {
    userId,

    // 👤 identité
    name: newData.name ?? current.name,
    language: newData.language ?? current.language,

    // 👍 intérêts fusionnés
    likes: [
      ...new Set([
        ...(current.likes || []),
        ...(newData.likes || [])
      ])
    ],

    // 🧠 notes évolutives
    notes: [
      ...(current.notes || []),
      ...(newData.notes || [])
    ]
  };

  const { error } = await supabase
    .from("memory")
    .upsert(updated);

  if (error) {
    console.log("❌ Supabase memory error:", error.message);
  }

  return updated;
}
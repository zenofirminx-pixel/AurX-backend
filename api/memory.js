import { supabase } from "./supabase.js";

// =========================
// GET MEMORY
// =========================
export async function getMemory(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("userid", userId)
    .single();

  if (error || !data) return null;

  return data;
}

// =========================
// UPDATE MEMORY SAFE
// =========================
export async function updateMemory(userId, newData) {
  if (!userId) return;

  // 1. récupérer existant
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("userid", userId)
    .single();

  // 2. si pas existant → create
  if (!data) {
    return await supabase.from("users").insert({
      userid: userId,
      nom: newData.nom || null,
      langue: newData.langue || null,
      role: newData.role || "user",
      notes: newData.notes || {},
      chat: newData.chat || [],
      created_at: new Date()
    });
  }

  // 3. merge sécurisé
  const updated = {
    ...data,
    ...newData,
    notes: {
      ...(data.notes || {}),
      ...(newData.notes || {})
    },
    chat: [
      ...(data.chat || []),
      ...(newData.chat || [])
    ]
  };

  // 4. update
  return await supabase
    .from("users")
    .update(updated)
    .eq("userid", userId);
}
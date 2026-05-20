import { supabase } from "./supabase.js";

// =========================
// GET MEMORY
// =========================
export async function getMemory(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("userid", userId)
    .maybeSingle(); // IMPORTANT (évite crash si vide)

  if (error) return {};
  if (!data) return {};

  return data;
}

// =========================
// UPDATE MEMORY (SAFE + AUTO CREATE)
// =========================
export async function updateMemory(userId, newData) {
  if (!userId) return;

  // 1. vérifier si user existe
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("userid", userId)
    .maybeSingle();

  // 2. si n'existe pas → CREATE USER
  if (!existing) {
    return await supabase.from("users").insert({
      userid: userId,
      nom: null,
      langue: null,
      likes: [],
      chat: [],
      ...newData
    });
  }

  // 3. merge intelligent (IMPORTANT)
  const merged = {
    ...existing,
    ...newData
  };

  // 4. update
  return await supabase
    .from("users")
    .update(merged)
    .eq("userid", userId);
}
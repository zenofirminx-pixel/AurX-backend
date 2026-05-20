import { supabase } from "./supabase.js";

// 🔍 GET MEMORY
export async function getMemory(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("userid", userId)
    .single();

  if (error) return {};

  return data || {};
}

// 💾 UPDATE MEMORY
export async function updateMemory(userId, newData) {
  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("userid", userId)
    .single();

  if (!existing) {
    // créer utilisateur si inexistant
    return await supabase.from("users").insert({
      userid: userId,
      ...newData
    });
  }

  // merge mémoire
  const merged = {
    ...existing,
    ...newData
  };

  return await supabase
    .from("users")
    .update(merged)
    .eq("userid", userId);
}
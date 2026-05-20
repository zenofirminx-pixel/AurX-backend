import { supabase } from "./supabase.js";

// =========================
// GET MEMORY
// =========================
export async function getMemory(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("userid", userId)
    .maybeSingle(); // 🔥 FIX IMPORTANT

  if (error) return null;
  if (!data) return null;

  return data;
}

// =========================
// UPDATE MEMORY SAFE
// =========================
export async function updateMemory(userId, newData) {
  if (!userId) return;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("userid", userId)
    .maybeSingle(); // 🔥 FIX IMPORTANT

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

  return await supabase
    .from("users")
    .update(updated)
    .eq("userid", userId);
}
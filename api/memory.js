import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// =========================
// GET MEMORY
// =========================
export async function getMemory(userId) {
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("userid", userId)
    .single();

  return data || {
    userid: userId,
    nom: null,
    langue: "fr",
    role: "user",
    notes: {},
    chat: []
  };
}

// =========================
// UPDATE MEMORY
// =========================
export async function updateMemory(userId, newData) {
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("userid", userId)
    .single();

  const current = data || {
    userid: userId,
    nom: null,
    langue: "fr",
    role: "user",
    notes: {},
    chat: []
  };

  const updated = {
    ...current,
    ...newData
  };

  await supabase
    .from("users")
    .upsert(updated, { onConflict: "userid" });

  return updated;
}
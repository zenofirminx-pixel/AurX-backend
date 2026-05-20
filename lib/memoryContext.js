export function buildMemoryContext(memory) {
  const chat = (memory?.chat || [])
    .slice(-10)
    .map(m => {
      const role = m.role || "user";
      const content = m.content || "";
      return `${role.toUpperCase()}: ${content}`;
    })
    .join("\n");

  return `
🧠 MEMOIRE UTILISATEUR
Nom: ${memory?.nom || "inconnu"}
Langue: ${memory?.langue || "non définie"}
Intérêts: ${(memory?.likes || []).join(", ") || "aucun"}
Notes: ${JSON.stringify(memory?.notes || {}, null, 2)}

────────────────────────
💬 CONTEXTE CHAT (10 derniers messages)
────────────────────────
${chat || "aucun historique"}
`;
}
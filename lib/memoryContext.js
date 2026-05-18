export function buildMemoryContext(memory) {
  return `
MEMOIRE UTILISATEUR:
- Nom: ${memory?.nom || "inconnu"}
- Langue: ${memory?.langue || "non définie"}
- Intérêts: ${(memory?.likes || []).join(", ") || "aucun"}
- Notes importantes: ${
    typeof memory?.notes === "string"
      ? memory.notes
      : JSON.stringify(memory?.notes || {})
  }

────────────────────────
💬 CONTEXTE CHAT
────────────────────────
${(memory?.chat || [])
  .slice(-10)
  .map(m => `${m.role}: ${m.content}`)
  .join("\n") || "aucun historique"}
`;
}
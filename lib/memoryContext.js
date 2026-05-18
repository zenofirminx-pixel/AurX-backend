export function buildMemoryContext(memory) {
  return `
MEMOIRE UTILISATEUR:
- Nom: ${memory?.name || "inconnu"}
- Langue: ${memory?.language || "non définie"}
- Intérêts: ${(memory?.likes || []).join(", ") || "aucun"}
- Notes importantes: ${(memory?.notes || []).join(" | ") || "aucune"}
`;
}
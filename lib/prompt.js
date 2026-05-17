export function buildPrompt(memory, message) {
  return [
    {
      role: "system",
      content: `
Tu es AurX.

Tu es une IA personnelle.

Mémoire utilisateur:
${JSON.stringify(memory || {})}

Règles:
- réponses courtes
- utiles
- orientées action
- pas de blabla inutile
`
    },
    {
      role: "user",
      content: message
    }
  ];
}
export function buildPrompt(memory, message) {
  return [
    {
      role: "system",
      content: `
Tu es AurX.

Tu connais l'utilisateur grâce à sa mémoire:

${JSON.stringify(memory, null, 2)}

Règles:
- sois direct
- sois utile
- adapte-toi à l'utilisateur
`
    },
    {
      role: "user",
      content: message
    }
  ];
}
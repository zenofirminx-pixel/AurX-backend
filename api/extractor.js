export async function extractMemory(message) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Tu es un système de mémoire IA.

Analyse le message et extrais uniquement les infos utiles sur l'utilisateur.

Retourne STRICTEMENT en JSON:

{
  "name": "",
  "country": "",
  "projects": [],
  "goals": [],
  "preferences": []
}

Si rien n'est trouvé, retourne {}.
`
        },
        {
          role: "user",
          content: message
        }
      ]
    })
  });

  const data = await res.json();

  try {
    return JSON.parse(data?.choices?.[0]?.message?.content || "{}");
  } catch {
    return {};
  }
}
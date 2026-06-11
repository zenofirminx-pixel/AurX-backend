export function extractMemory(message) {
  const memories = [];

  // STOPWORDS: mots à ne JAMAIS enregistrer comme nom
  const stopWords = [
    'comment', 'qui', 'quoi', 'où', 'quand', 'pourquoi', 'que', 'quoi',
    'triste', 'content', 'fatigué', 'malade', 'bien', 'mal', 'là', 'ici',
    'arrivé', 'parti', 'allé', 'venu', 'sûr', 'certain', 'désolé'
  ];

  // 1. NOM - uniquement patterns explicites
  const namePatterns = [
    /^je m'appelle\s+([a-zà-ÿ][a-zà-ÿ'-]{1,20})$/i,
    /^moi c'est\s+([a-zà-ÿ][a-zà-ÿ'-]{1,20})$/i,
    /^appelle[- ]moi\s+([a-zà-ÿ][a-zà-ÿ'-]{1,20})$/i,
    /^mon nom est\s+([a-zà-ÿ][a-zà-ÿ'-]{1,20})$/i,
    /^je suis\s+([a-zà-ÿ][a-zà-ÿ'-]{1,20})$/i,
  ];

  for (const pattern of namePatterns) {
    const match = message.trim().match(pattern);
    if (match && match[1]) {
      const name = match[1].toLowerCase().trim();

      // Filtre strict: pas de stopWords, min 2 chars
      if (!stopWords.includes(name) && name.length >= 2 && name.length <= 20) {
        const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
        memories.push({
          type: "identity",
          key: "name",
          value: capitalizedName,
          importance: 10
        });
        break; // Un seul nom
      }
    }
  }

  // 2. PRÉFÉRENCES - j'aime/j'adore/je déteste uniquement
  const prefPatterns = [
    { regex: /j'aime\s+(?:bien\s+)?([^.!?]{3,40})/i, type: "like" },
    { regex: /j'adore\s+([^.!?]{3,40})/i, type: "like" },
    { regex: /je déteste\s+([^.!?]{3,40})/i, type: "dislike" },
    { regex: /je préfère\s+([^.!?]{3,40})/i, type: "like" }
  ];

  for (const { regex, type } of prefPatterns) {
    const match = message.match(regex);
    if (match && match[1]) {
      const pref = match[1].trim().toLowerCase();
      // Filtre: pas de "comment", min 3 chars, max 40
      if (pref.length >= 3 && pref.length <= 40 &&!pref.includes('comment') &&!pref.includes('que')) {
        memories.push({
          type: "preference",
          key: type,
          value: pref,
          importance: 6
        });
      }
    }
  }

  // 3. INFOS UTILES - que 3 types max
  const usefulPatterns = [
    { regex: /j'habite\s+(?:à|en|au)\s+([a-zà-ÿ\s'-]{3,30})/i, key: "location" },
    { regex: /j'ai\s+(\d{1,3})\s+ans/i, key: "age" },
    { regex: /(?:je suis|je travaille comme|mon métier c'est)\s+([a-zà-ÿ\s]{3,30})/i, key: "job" }
  ];

  for (const { regex, key } of usefulPatterns) {
    const match = message.match(regex);
    if (match && match[1]) {
      const value = match[1].trim();
      if (value.length >= 2) {
        memories.push({
          type: "fact",
          key: key,
          value: value,
          importance: 7
        });
      }
    }
  }

  return memories;
}
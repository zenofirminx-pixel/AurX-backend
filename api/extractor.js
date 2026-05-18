export async function extractMemory(message) {
  try {
    const lower = message.toLowerCase();

    const result = {};

    if (lower.includes("je m'appelle")) {
      result.nom = message.split("je m'appelle")[1]?.trim();
    }

    if (lower.includes("langue")) {
      result.langue = lower.includes("anglais") ? "en" : "fr";
    }

    return result;
  } catch {
    return {};
  }
}
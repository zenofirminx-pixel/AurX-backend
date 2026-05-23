export function formatReply(text = "") {
  let output = text.trim();

  // =========================
  // 1. Nettoyage général
  // =========================
  output = output.replace(/\n{3,}/g, "\n\n");

  // =========================
  // 2. Supprimer style robotique final
  // =========================
  output = output.replace(
    /Si tu as d'autres questions.*$/gi,
    ""
  );

  // =========================
  // 3. Améliorer respiration du texte
  // =========================
  output = output
    .replace(/\. /g, ".\n\n");

  return output.trim();
}
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = {
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

export default async function handler(req, res) {
  try {
    const snapshot = await db.collection('conversations').get();

    if (snapshot.empty) {
      return res.status(200).send(`
        <h1>✅ Firestore vide</h1>
        <p>Aucune conversation enregistrée.</p>
      `);
    }

    const now = Date.now();
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;

    let oldCount = 0;
    let deletedCount = 0;

    let html = `<h1>⚠️ ${snapshot.size} conversation(s) trouvée(s)</h1><hr>`;

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // ✅ COMPATIBLE AVEC TON SYSTEME ACTUEL
      const updated =
        data.updated_at ||
        data.updatedAt ||
        data.date ||
        0;

      const age = now - updated;
      const days = Math.floor(age / (24 * 60 * 60 * 1000));

      const isOld = age > fourteenDays;
      if (isOld) oldCount++;

      html += `
        <div style="border:1px solid ${isOld ? 'red' : 'green'}; padding:10px; margin:10px 0;">
          <b>Doc ID:</b> ${doc.id}<br>
          <b>Google ID:</b> ${data.google_id || data.userId || 'guest'}<br>
          <b>Titre:</b> ${data.title || 'Sans titre'}<br>
          <b>Messages:</b> ${data.messages?.length || 0}<br>
          <b>Updated:</b> ${updated ? new Date(updated).toLocaleString() : 'N/A'}<br>
          <b>Âge:</b> ${days} jours ${isOld ? '❌ +14j' : '✅'}
        </div>
      `;

      // 🔥 OPTION SAFE : suppression activable
      if (req.query.delete === "true" && isOld) {
        await doc.ref.delete();
        deletedCount++;
      }
    }

    html += `<hr>
      <h3>Résumé</h3>
      <p>Anciennes convs: ${oldCount}</p>
      <p>Supprimées: ${deletedCount}</p>
    `;

    html += `
      <hr>
      <p>
        🔧 Mode delete: <a href="?delete=true">ACTIVER NETTOYAGE</a>
      </p>
    `;

    res.status(200).send(html);

  } catch (err) {
    res.status(500).send(`<h1>❌ Erreur</h1><pre>${err.message}</pre>`);
  }
}
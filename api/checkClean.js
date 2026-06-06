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
    const snapshot = await db.collection('conversations').limit(50).get();

    if (snapshot.empty) {
      return res.status(200).send(`
        <h1>✅ Firestore vide</h1>
        <p>Aucune conversation enregistrée. Toutes les données sont supprimées.</p>
      `);
    }

    const now = Date.now();
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    let oldCount = 0;
    
    let html = `<h1>⚠️ ${snapshot.size} conv(s) encore dans Firestore</h1><hr>`;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const age = now - (data.updated_at || 0);
      const days = Math.floor(age / (24*60*60*1000));
      const isOld = age > fourteenDays;
      if (isOld) oldCount++;
      
      html += `
        <div style="border:1px solid ${isOld ? 'red' : 'green'}; padding:10px; margin:10px 0;">
          <b>Doc ID:</b> ${doc.id}<br>
          <b>Google ID:</b> ${data.google_id || 'guest'}<br>
          <b>Titre:</b> ${data.title || 'Sans titre'}<br>
          <b>Messages:</b> ${data.messages?.length || 0}<br>
          <b>Updated:</b> ${data.updated_at ? new Date(data.updated_at).toLocaleString() : 'N/A'}<br>
          <b>Âge:</b> ${days} jours ${isOld ? '❌ +14j devrait être supprimé' : '✅'}
        </div>
      `;
    });

    html += `<hr><h3>Résumé: ${oldCount} conv(s) de +14j pas supprimées</h3>`;
    res.status(200).send(html);

  } catch (err) {
    res.status(500).send(`<h1>❌ Erreur</h1><pre>${err.message}</pre>`);
  }
}
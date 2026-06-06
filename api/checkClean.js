import { db } from './initMemory.js';
import { parse } from 'cookie';

export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', 'https://aurx.vercel.app');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    const cookies = parse(req.headers.cookie || '');
    const session = cookies.aurx_session;

    if (!session) {
      return res.status(401).json({ error: 'No session' });
    }

    let data;
    try {
      data = JSON.parse(Buffer.from(session, 'base64').toString());
    } catch (e) {
      return res.status(400).json({ error: 'Bad session format' });
    }

    const userId = data.sid || data.id;

    if (!userId) {
      return res.status(401).json({ error: 'No userId in session' });
    }

    // =========================
    // SAFE FIREBASE READS
    // =========================
    let conversations = null;
    let messagesCount = 0;
    let memoryCount = 0;

    try {
      const convSnap = await db.collection('conversations').doc(userId).get();
      conversations = convSnap.exists ? convSnap.data() : null;
    } catch (e) {
      conversations = { error: 'conv read failed' };
    }

    try {
      const msgSnap = await db.collection('users').doc(userId).collection('messages').get();
      messagesCount = msgSnap.size || 0;
    } catch (e) {
      messagesCount = -1;
    }

    try {
      const memSnap = await db.collection('users').doc(userId).collection('memory').get();
      memoryCount = memSnap.size || 0;
    } catch (e) {
      memoryCount = -1;
    }

    return res.status(200).json({
      ok: true,
      userId,
      conversations,
      messagesCount,
      memoryCount
    });

  } catch (err) {
    console.error('debugMemory crash:', err);

    return res.status(500).json({
      error: 'Server crash',
      details: err.message
    });
  }
}
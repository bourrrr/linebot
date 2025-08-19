// MakeWell 志工配對聊天室（轉送＋配對＋結束功能）
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const crypto = require('crypto');


admin.initializeApp();
const db = admin.firestore();

const app = express();

// ====== 驗證簽章 ======
function verifySignature(signature, body) {
  const secret = process.env.VOLLINE_LINE_CHANNEL_SECRET;
  if (!secret) {
    console.error('❌ 環境變數 VOLLINE_LINE_CHANNEL_SECRET 沒有載入');
    return false;
  }
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
  return signature === hash;
}

// ====== LINE API ======
const CHANNEL_TOKEN = process.env.VOLLINE_LINE_CHANNEL_ACCESS_TOKEN;

async function replyMessage(replyToken, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CHANNEL_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ replyToken, messages })
  });
  if (!res.ok) console.error('LINE reply failed', await res.text());
}

async function pushTo(userId, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CHANNEL_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ to: userId, messages })
  });
  if (!res.ok) console.error('LINE push failed', await res.text());
}

// ====== Firestore 查配對 ======
async function findActiveMatchByUser(lineUserId) {
  const snap = await db.collection('matches')
    .where('status', '==', 'active')
    .where('participants', 'array-contains', lineUserId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

// ====== 允許 rawBody 驗證 LINE 簽章 ======
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ====== Webhook：文字訊息轉送 ======
app.post('/', async (req, res) => {
  try {
    const signature = req.headers['x-line-signature'];
    const rawBody = req.rawBody;

    if (!verifySignature(signature, rawBody)) {
      console.error('Invalid signature');
      return res.status(401).send('bad signature');
    }

    const body = JSON.parse(rawBody.toString('utf8'));

    for (const evt of body.events || []) {
      if (evt.type !== 'message' || !evt.source?.userId) continue;

      const fromUserId = evt.source.userId;
      const msg = evt.message;

      if (msg.type !== 'text') {
        await replyMessage(evt.replyToken, [
          { type: 'text', text: '目前僅支援文字訊息。' }
        ]);
        continue;
      }

      const match = await findActiveMatchByUser(fromUserId);
      if (!match) {
        await replyMessage(evt.replyToken, [
          { type: 'text', text: '目前沒有活躍的配對，訊息無法轉送。' }
        ]);
        continue;
      }

      const otherUserId = match.participants.find(id => id !== fromUserId);
      if (!otherUserId) {
        await replyMessage(evt.replyToken, [
          { type: 'text', text: '配對異常，請聯繫客服。' }
        ]);
        continue;
      }

      // 記錄訊息
      await db.collection('matches').doc(match.id).collection('messages').add({
        from: fromUserId,
        text: msg.text,
        ts: admin.firestore.FieldValue.serverTimestamp()
      });

      // 轉送文字
      await pushTo(otherUserId, [
        { type: 'text', text: msg.text }
      ]);

      await replyMessage(evt.replyToken, [
        { type: 'text', text: '✓ 訊息已轉送' }
      ]);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('lineWebhook error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ====== Callable：建立配對 ======
exports.createMatch = functions.https.onCall(async (data, context) => {
  const { taskId, patientUserId, volunteerUserId, patientAuthUid, volunteerAuthUid } = data || {};
  if (!taskId || !patientUserId || !volunteerUserId) {
    throw new functions.https.HttpsError('invalid-argument', '缺少必要參數');
  }

  const batch = db.batch();
  for (const uid of [patientUserId, volunteerUserId]) {
    const q = await db.collection('matches')
      .where('status', '==', 'active')
      .where('participants', 'array-contains', uid)
      .get();
    q.forEach(d => batch.update(d.ref, {
      status: 'closed',
      closedAt: admin.firestore.FieldValue.serverTimestamp()
    }));
  }

  const ref = db.collection('matches').doc();
  batch.set(ref, {
    taskId,
    patientUserId,
    volunteerUserId,
    participants: [patientUserId, volunteerUserId],
    participantsAuthUids: [patientAuthUid, volunteerAuthUid].filter(Boolean),
    status: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    closedAt: null
  });

  await batch.commit();

  await Promise.all([
    pushTo(patientUserId, [{ type: 'text', text: '✅ 已為您配對志工，請開始聯繫！' }]),
    pushTo(volunteerUserId, [{ type: 'text', text: '✅ 配對成功，請與患者聯繫！' }])
  ]);

  return { matchId: ref.id };
});

// ====== Callable：關閉聊天室 ======
exports.closeMatch = functions.https.onCall(async (data, context) => {
  const { matchId, reason } = data || {};
  if (!matchId) throw new functions.https.HttpsError('invalid-argument', '缺少 matchId');

  const ref = db.collection('matches').doc(matchId);
  const doc = await ref.get();
  if (!doc.exists) throw new functions.https.HttpsError('not-found', '找不到配對紀錄');

  const match = doc.data();
  if (match.status === 'closed') return { ok: true };

  await ref.update({
    status: 'closed',
    closedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const msg = { type: 'text', text: `📴 任務已結束，聊天室關閉${reason ? `（原因：${reason}）` : ''}` };
  await Promise.all([
    pushTo(match.patientUserId, [msg]),
    pushTo(match.volunteerUserId, [msg])
  ]);

  return { ok: true };
});

// ====== 匯出 Webhook Function ======
exports.lineWebhook = functions
  .region('us-central1')
  .runWith({
    secrets: ['VOLLINE_LINE_CHANNEL_SECRET', 'VOLLINE_LINE_CHANNEL_ACCESS_TOKEN']
  })
  .https.onRequest(app);

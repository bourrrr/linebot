// --- 共用基礎 ---
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

// rawBody 中介軟體（讓 LINE 驗簽可讀到原始 body）
const rawJson = express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
});

// ===== 共用工具：驗簽/LINE Client =====
function verifySignature(channelSecret, rawBody, signature) {
  if (!channelSecret) return false;
  const hash = crypto.createHmac('SHA256', channelSecret).update(rawBody).digest('base64');
  return signature === hash;
}

function makeLineClient(channelAccessToken) {
  return {
    async reply(replyToken, messages) {
      const res = await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${channelAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ replyToken, messages })
      });
      if (!res.ok) console.error('[LINE reply] failed:', await res.text());
    },
    async push(to, messages) {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${channelAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to, messages })
      });
      if (!res.ok) console.error('[LINE push] failed:', await res.text());
    }
  };
}

// ===== 共用：副系統（臨時聊天室）需要的查配對 =====
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

/** ========================
 *  副系統（臨時聊天室）Webhook
 *  ======================== */
const volApp = express();
volApp.use(rawJson);

volApp.post('/', async (req, res) => {
  try {
    const sig = req.headers['x-line-signature'];
    const rawBody = req.rawBody;
    const secret = process.env.VOLLINE_LINE_CHANNEL_SECRET;
    const token  = process.env.VOLLINE_LINE_CHANNEL_ACCESS_TOKEN;

    if (!verifySignature(secret, rawBody, sig)) {
      console.error('[VOL] bad signature');
      return res.status(401).send('bad signature');
    }

    const body = JSON.parse(rawBody.toString('utf8'));
    const client = makeLineClient(token);

    for (const evt of body.events || []) {
      if (evt.type !== 'message' || !evt.source?.userId) continue;

      const fromUserId = evt.source.userId;
      const msg = evt.message;

      if (msg.type !== 'text') {
        await client.reply(evt.replyToken, [{ type: 'text', text: '目前僅支援文字訊息。' }]);
        continue;
      }

      const match = await findActiveMatchByUser(fromUserId);
      if (!match) {
        await client.reply(evt.replyToken, [{ type: 'text', text: '目前沒有活躍的配對，訊息無法轉送。' }]);
        continue;
      }

      const otherUserId = match.participants.find(id => id !== fromUserId);
      if (!otherUserId) {
        await client.reply(evt.replyToken, [{ type: 'text', text: '配對異常，請聯繫客服。' }]);
        continue;
      }

      // 紀錄訊息
      await db.collection('matches').doc(match.id).collection('messages').add({
        from: fromUserId,
        text: msg.text,
        ts: admin.firestore.FieldValue.serverTimestamp()
      });

      // 轉送
      await client.push(otherUserId, [{ type: 'text', text: msg.text }]);
      await client.reply(evt.replyToken, [{ type: 'text', text: '✓ 訊息已轉送' }]);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[VOL webhook] error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Callable：建立配對（維持原有行為）
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

  const client = makeLineClient(process.env.VOLLINE_LINE_CHANNEL_ACCESS_TOKEN);
  await Promise.all([
    client.push(patientUserId, [{ type: 'text', text: '✅ 已為您配對志工，請開始聯繫！' }]),
    client.push(volunteerUserId, [{ type: 'text', text: '✅ 配對成功，請與患者聯繫！' }])
  ]);

  return { matchId: ref.id };
});

// Callable：關閉聊天室（維持原有行為）
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
  const client = makeLineClient(process.env.VOLLINE_LINE_CHANNEL_ACCESS_TOKEN);
  await Promise.all([
    client.push(match.patientUserId, [msg]),
    client.push(match.volunteerUserId, [msg])
  ]);

  return { ok: true };
});

// 匯出：副系統 Webhook（改名，避免與主系統衝突）
exports.lineWebhookVol = functions
  .region('asia-east1') // 建議與 Firestore 同區
  .runWith({
    secrets: ['VOLLINE_LINE_CHANNEL_SECRET', 'VOLLINE_LINE_CHANNEL_ACCESS_TOKEN']
  })
  .https.onRequest(volApp);

/** ========================
 *  主系統 Webhook（新）
 *  ======================== */
const mainApp = express();
mainApp.use(rawJson);

mainApp.post('/', async (req, res) => {
  try {
    const sig = req.headers['x-line-signature'];
    const rawBody = req.rawBody;
    const secret = process.env.MAIN_LINE_CHANNEL_SECRET;
    const token  = process.env.MAIN_LINE_CHANNEL_ACCESS_TOKEN;

    if (!verifySignature(secret, rawBody, sig)) {
      console.error('[MAIN] bad signature');
      return res.status(401).send('bad signature');
    }

    const body = JSON.parse(rawBody.toString('utf8'));
    const client = makeLineClient(token);

    // 這裡放主系統的處理邏輯（歡迎訊息/關鍵字/功能選單…）
    for (const evt of (body.events || [])) {
      if (evt.type === 'message' && evt.message?.type === 'text') {
        await client.reply(evt.replyToken, [{ type: 'text', text: `主系統收到：${evt.message.text}` }]);
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[MAIN webhook] error:', err);
    res.status(500).send('Internal Server Error');
  }
});

exports.lineWebhookMain = functions
  .region('asia-east1')
  .runWith({
    secrets: ['MAIN_LINE_CHANNEL_SECRET', 'MAIN_LINE_CHANNEL_ACCESS_TOKEN']
  })
  .https.onRequest(mainApp);
const loginApp = express();
const cors = require('cors');
loginApp.use(cors({ origin: true }));
loginApp.use(express.json());

loginApp.post('/getFirebaseCustomToken', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ error: 'missing idToken' });

    // 驗證 id_token（用 LINE Login Channel ID，不是 Bot 的）
    const verifyResp = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        id_token: idToken,
        client_id: process.env.MAIN_LINE_LOGIN_CHANNEL_ID, // ← 你的 LINE Login Channel ID
      }),
    });
    const verifyJson = await verifyResp.json();
    if (!verifyResp.ok || verifyJson.error) {
      throw new Error(verifyJson.error_description || 'LINE id_token verify failed');
    }

    // 解析 LINE Login 回傳的 user profile
    const lineSub = verifyJson.sub;
    const displayName = verifyJson.name || '';
    const picture = verifyJson.picture || '';

    const uid = `line:${lineSub}`;

    // 確保 Firebase 有這個 user
    try {
      await admin.auth().getUser(uid);
      await admin.auth().updateUser(uid, {
        displayName: displayName || undefined,
        photoURL: picture || undefined,
      });
    } catch (e) {
      await admin.auth().createUser({
        uid,
        displayName: displayName || undefined,
        photoURL: picture || undefined,
      });
    }

    // Firestore 同步一份
    await db.collection('users').doc(uid).set({
      provider: 'line',
      displayName,
      picture,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 簽出 Firebase Custom Token
    const customToken = await admin.auth().createCustomToken(uid, { provider: 'line' });
    return res.json({ customToken, uid });
  } catch (err) {
    console.error('getFirebaseCustomToken error:', err);
    return res.status(401).json({ error: err.message || 'verify failed' });
  }
});

// 匯出：主系統登入驗證 API
exports.authApi = functions
  .region('asia-east1')
  .runWith({ secrets: ['MAIN_LINE_LOGIN_CHANNEL_ID'] })
  .https.onRequest(loginApp);
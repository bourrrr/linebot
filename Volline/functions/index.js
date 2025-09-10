// --- 共用基礎 ---
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const crypto = require('crypto');
const { normalizeData, normKey } = require('./normalizer');

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
  // 匯出：主系統登入驗證 API

// === Auto close expired chats (time + 1.5h) ===
exports.autoCloseExpiredChats = functions.pubsub
  .schedule("every 60 minutes")
  .timeZone("Asia/Taipei")
  .onRun(async () => {
    const now = Date.now();
    const cutoff = now - 90 * 60 * 1000;

    const ms = await db.collection("matches").where("status","==","active").get();
    const batch = db.batch();

    for (const d of ms.docs) {
      const m = d.data();
      if (!m.taskId) continue;

      const taskSnap = await db.collection("requests").doc(m.taskId).get();
      if (!taskSnap.exists) continue;

      const t = taskSnap.data();
      const tMs =
        (t.time && t.time.toMillis && t.time.toMillis()) ||
        (t.time && Date.parse(t.time)) ||
        0;

      if (tMs && tMs < cutoff) {
        batch.update(d.ref, {
          status: "closed",
          closedBy: "system",
          closedReason: "expired_1h30",
          closedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        if (t.status !== "completed") {
          batch.update(taskSnap.ref, {
            status: "expired",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }

    await batch.commit();
    return null;
  });
  // 自動標準化：health_records 新增
exports.healthRecordNormalize = functions
  .region('asia-east1')
  .firestore.document('health_records/{id}')
  .onCreate(async (snap) => {
    const doc = snap.data() || {};
    if (!doc.data) return null;
    if (doc.__normalized === true) return null;

    const { normalized } = await normalizeData(doc.data, { learn: true });

    const same =
      Object.keys(doc.data).length === Object.keys(normalized).length &&
      Object.keys(doc.data).every(k => normalized[k] === doc.data[k]);

    await snap.ref.update({
      data: normalized,
      orderKeys: Object.keys(normalized),
      __normalized: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return null;
  });

// （可選）編輯時也做
exports.healthRecordNormalizeOnUpdate = functions
  .region('asia-east1')
  .firestore.document('health_records/{id}')
  .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after  = change.after.data()  || {};
    if (!after.data) return null;

    const changed = JSON.stringify(before.data || {}) !== JSON.stringify(after.data || {});
    if (!changed) return null;

    const { normalized } = await normalizeData(after.data, { learn: true });

    await change.after.ref.update({
      data: normalized,
      orderKeys: Object.keys(normalized),
      __normalized: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return null;
  });
exports.approvePendingAlias = functions
  .region('asia-east1')
  .https.onCall(async (req, ctx) => {
    // TODO: 你可以在這裡檢查 ctx.auth 是否為管理員
    const { id } = req;
    if (!id) throw new functions.https.HttpsError('invalid-argument', 'id 必填');

    const db = admin.firestore();
    const ref = db.collection('pending_aliases').doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found', '找不到 pending_alias');
    const { std, alias, status } = snap.data();
    if (status === 'approved') return { ok: true, message: '已是核可狀態' };
    if (status === 'rejected') return { ok: false, message: '已被拒絕' };

    const keyRef = db.collection('key_alias').doc(keyIdForFirestore(std));
    await db.runTransaction(async (tx) => {
      tx.set(keyRef, {
        aliases: admin.firestore.FieldValue.arrayUnion(alias),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      tx.update(ref, {
        status: 'approved',
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return { ok: true };
  });

exports.rejectPendingAlias = functions
  .region('asia-east1')
  .https.onCall(async (req, ctx) => {
    // TODO: 同上可檢查權限
    const { id } = req;
    if (!id) throw new functions.https.HttpsError('invalid-argument', 'id 必填');
    const db = admin.firestore();
    const ref = db.collection('pending_aliases').doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found', '找不到 pending_alias');
    const { status } = snap.data();
    if (status === 'approved') return { ok: false, message: '已核可，不能拒絕' };
    if (status === 'rejected') return { ok: true, message: '已是拒絕狀態' };

    await ref.update({
      status: 'rejected',
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { ok: true };
  });

// 這裡重用 normalizer 的工具方法
function keyIdForFirestore(stdKey){ return String(stdKey).replace(/\//g,'__'); }

// --- 簽到用 Functions ---
function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function initDay(uid, dateKey) {
  const ref = db.doc(`checkins/${uid}/days/${dateKey}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      total_plans: 1,
      completed_count: 0,
      completion_rate: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  return ref;
}

exports.markReminderDone = functions
  .region("asia-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "請先登入");
    const uid = context.auth.uid;
    const dateKey = data?.dateKey || todayKey();
    const ref = await initDay(uid, dateKey);

    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const cur = snap.data() || {};
      let total = cur.total_plans || 1;
      let done = cur.completed_count || 0;
      done = Math.min(done + 1, total);
      tx.update(ref, {
        completed_count: done,
        completion_rate: total > 0 ? done / total : 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    return { ok: true };
  });

exports.undoReminderDone = functions
  .region("asia-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "請先登入");
    const uid = context.auth.uid;
    const dateKey = data?.dateKey || todayKey();
    const ref = await initDay(uid, dateKey);

    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const cur = snap.data() || {};
      let done = cur.completed_count || 0;
      done = Math.max(done - 1, 0);
      tx.update(ref, {
        completed_count: done,
        completion_rate: (cur.total_plans || 1) > 0 ? done / (cur.total_plans || 1) : 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    return { ok: true };
  });

exports.recalcDay = functions
  .region("asia-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "請先登入");
    const uid = context.auth.uid;
    const dateKey = data?.dateKey || todayKey();
    const ref = await initDay(uid, dateKey);

    await ref.set({
      total_plans: 1,
      completed_count: 0,
      completion_rate: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { ok: true };
  });

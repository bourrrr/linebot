// --- 共用基礎 ---
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const express = require('express');
const crypto = require('crypto');
const { normalizeData: baseNormalizeData, normKey } = require('./normalizer');
const { makeMatchCard } = require('./flex-cards');
const { renderSwitchCarousel } = require('./quick-replies'); // ★ 新增：改由共用檔產生（多頁）Quick Reply

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
      const txt = await res.text(); // ⭐ 詳盡 log
      console.log('[LINE reply]', { status: res.status, body: txt });
      if (!res.ok) console.error('[LINE reply] failed');
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
      const txt = await res.text(); // ⭐ 詳盡 log
      console.log('[LINE push]', { to, status: res.status, body: txt });
      if (!res.ok) console.error('[LINE push] failed');
    }
  };
}

/* =========================
 *  ⭐ 新增：authUid / 任意 id 轉 副帳號 U… 的工具
 *  - 先找 users/vol:<U>；若無再找 users/<authUid> 之中的 volLineUserId
 * ========================= */
async function getVolIdFromAny(anyId) {
  if (!anyId) return null;
  try {
    const key = String(anyId).replace(/^line:/, '');
    const try1 = await db.doc(`users/vol:${key}`).get();
    if (try1.exists && try1.data()?.volLineUserId) return try1.data().volLineUserId;

    const try2 = await db.doc(`users/${anyId}`).get();
    if (try2.exists && try2.data()?.volLineUserId) return try2.data().volLineUserId;

    return null;
  } catch (e) {
    console.error('[getVolIdFromAny] error:', e);
    return null;
  }
}

// ===== 共用：副系統（臨時聊天室）需要的查配對 =====
async function findActiveMatchByUser(lineUserId) {
  const variations = [lineUserId];
  if (lineUserId.startsWith("line:")) {
    variations.push(lineUserId.replace(/^line:/, "")); // 去掉 line:
  } else {
    variations.push(`line:${lineUserId}`); // 加上 line:
  }

  const snap = await db.collection('matches')
    .where('status', '==', 'active')
    .where('participants', 'array-contains-any', variations)
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
      console.log('[VOL] incoming type=%s userId=%s', evt.type, evt.source?.userId);

      // A) postback：Quick Reply 選人 → 設定目前對話對象
      if (evt.type === 'postback' && evt.postback?.data?.startsWith('action=setMatch')) {
        const matchId = new URLSearchParams(evt.postback.data).get('matchId');
        await db.doc(`users/vol:${evt.source.userId}`).set({
          currentMatchId: matchId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        await client.reply(evt.replyToken, [{ type:'text', text:'已切換對話對象 ✅' }]);
        continue;
      }

      // A-2) postback：卡片分頁（上一頁/下一頁）
      if (evt.type === 'postback' && evt.postback?.data?.startsWith('action=cardList')) {
        const params = new URLSearchParams(evt.postback.data);
        const page = parseInt(params.get('page') || '1', 10) || 1;
        await renderSwitchCarousel(client, evt.replyToken, evt.source.userId, page);
        continue;
      }

      // B) follow：把副帳號的 U 存起來（供 createMatch 映射使用）
      if (evt.type === 'follow' && evt.source?.userId) {
        const volId = evt.source.userId; // U 開頭（副帳號）
        await db.doc(`users/vol:${volId}`).set({
          volLineUserId: volId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        await client.reply(evt.replyToken, [{ type: 'text', text: '已開啟臨時聊天室 ✅' }]);
        continue;
      }

      // C) 僅處理文字訊息
      if (evt.type !== 'message' || !evt.source?.userId) continue;

      const fromUserId = evt.source.userId;
      const msg = evt.message;

      if (msg.type !== 'text') {
        await client.reply(evt.replyToken, [{ type: 'text', text: '目前僅支援文字訊息。' }]);
        continue;
      }

      // 支援「切換對象」指令：顯示多頁 Quick Reply 卡片清單
      if (/^切換(對象|對話對象)?$/.test(msg.text.trim())) {
        await renderSwitchCarousel(client, evt.replyToken, fromUserId, 1);
        continue;
      }

      // D) 轉送：先看是否已選過對象（currentMatchId），再 fallback
      let match = null;

      // 先讀取 currentMatchId
      const uDoc = await db.doc(`users/vol:${fromUserId}`).get();
      const currentMatchId = uDoc.exists ? uDoc.data()?.currentMatchId : null;

      if (currentMatchId) {
        const mDoc = await db.collection('matches').doc(currentMatchId).get();
        if (mDoc.exists) {
          const m = mDoc.data();
          if (m.status === 'active' && Array.isArray(m.participants) && m.participants.includes(fromUserId)) {
            match = { id: mDoc.id, ...m };
          } else {
            // 失效就清掉，避免下次繼續卡住
            await db.doc(`users/vol:${fromUserId}`).set({
              currentMatchId: admin.firestore.FieldValue.delete()
            }, { merge: true });
          }
        }
      }

      // 沒選過或選的已失效 → 用原本查詢（容錯：支援 U / line:U）
      if (!match) {
        match = await findActiveMatchByUser(fromUserId);
      }

      console.log('[VOL] match found?', !!match, 'id=', match?.id, 'participants=', match?.participants);
      if (!match) {
        await client.reply(evt.replyToken, [{ type: 'text', text: '目前沒有活躍的配對，訊息無法轉送。' }]);
        continue;
      }

      const otherUserId = match.participants.find(id => id !== fromUserId);
      if (!otherUserId) {
        await client.reply(evt.replyToken, [{ type: 'text', text: '配對資料異常，請稍後再試。' }]);
        continue;
      }

      // === 新增：帶來源標記的轉送文字 ===
	function buildRelayText(match, fromUserId, text) {
	  const isFromPatient = fromUserId === match.patientUserId;
	  const who = isFromPatient
		? `👤'患者' ${(match.patientName && String(match.patientName).trim()) || '患者'}\n\n`
		: `🧑‍⚕️'志工' ${(match.volunteerName && String(match.volunteerName).trim()) || '志工'}\n\n`;

	  const task = (match.taskTitle && String(match.taskTitle).trim())
		? `｜${String(match.taskTitle).trim()}`
		: '';

	  const hospital = (match.hospital && String(match.hospital).trim())
		? `＠${String(match.hospital).trim()}`
		: '';

	  return `${who}${task}${hospital}\n${text}`;
	}


      // 紀錄訊息
      await db.collection('matches').doc(match.id).collection('messages').add({
        from: fromUserId,
        text: msg.text,
        ts: admin.firestore.FieldValue.serverTimestamp()
      });

      // 轉送給對方（自動加上來源標註）
      const relayText = buildRelayText(match, fromUserId, msg.text);
      await client.push(otherUserId, [{ type: 'text', text: relayText }]);

      // 回覆發訊者已轉送（維持原本的提示）
      await client.reply(evt.replyToken, [{ type: 'text', text: '✓ 訊息已轉送' }]);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[VOL webhook] error:', err);
    res.status(500).send('Internal Server Error');
  }
});


// Callable：建立配對（維持原有行為，補上副帳號 U 自動對應）
exports.createMatch = functions.region('asia-east1') .runWith({ secrets: ['VOLLINE_LINE_CHANNEL_ACCESS_TOKEN', 'VOLLINE_LINE_BOT_ID'] }).https.onCall(async (data, context) => {
  const { taskId, patientUserId, volunteerUserId, patientAuthUid, volunteerAuthUid } = data || {};
  if (!taskId || !patientUserId || !volunteerUserId) {
    throw new functions.https.HttpsError('invalid-argument', '缺少必要參數');
  }

  // ⭐ 新增：若帶了 authUid，嘗試把它們轉成「副帳號 U…」
  let pId = patientUserId;
  let vId = volunteerUserId;
  try {
    const pVol = await getVolIdFromAny(patientAuthUid);
    const vVol = await getVolIdFromAny(volunteerAuthUid);
    if (pVol && vVol) {
      pId = pVol;
      vId = vVol;
      console.log('[createMatch] mapped authUid -> vol U ids', { pId, vId });
    } else {
      console.log('[createMatch] fallback to provided userIds (no vol U mapping found)');
    }
  } catch (e) {
    console.warn('[createMatch] mapping vol ids failed, use provided ids. err=', e);
  }

  const batch = db.batch();
  const ref = db.collection('matches').doc();
		
	const matchData = {
	  taskId,
	  patientUserId: pId,
	  volunteerUserId: vId,
	  patientAuthUid: patientAuthUid || null,
	  volunteerAuthUid: volunteerAuthUid || null,
	  status: 'active',
	  participants: [pId, vId],
	  patientName: data.patientName || '',
	  volunteerName: data.volunteerName || '', 
	  taskTitle: data.taskTitle || '',
	  hospital: data.hospital || '',   // ⭐ 新增
	  createdAt: admin.firestore.FieldValue.serverTimestamp(),
	};

	batch.set(ref, matchData);
	await batch.commit();
	await db.collection('requests').doc(taskId).set({
  matchId: ref.id,
  updatedAt: admin.firestore.FieldValue.serverTimestamp()
}, { merge: true });

  // 加聊天室深連結
  const LINE_BOT_ID = process.env.VOLLINE_LINE_BOT_ID;
  const chatLink = `https://line.me/R/oaMessage/${LINE_BOT_ID}/`;

  const client = makeLineClient(process.env.VOLLINE_LINE_CHANNEL_ACCESS_TOKEN);
		await Promise.all([
		  client.push(pId, [
			makeMatchCard("patient", data.taskTitle, data.hospital, chatLink, data.volunteerName)
		  ]),
		  client.push(vId, [
			makeMatchCard("volunteer", data.taskTitle, data.hospital, chatLink, data.patientName)
		  ])
		]);


  return { matchId: ref.id };
});



// Callable：關閉聊天室（維持原有行為）
exports.closeMatch = functions.region('asia-east1').https.onCall(async (data, context) => {
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

// === 新增：onCall 版本，取代 fetch 的用法 ===
exports.firebaseCustomToken = functions
  .region('asia-east1')
  .runWith({ secrets: ['MAIN_LINE_LOGIN_CHANNEL_ID'] })
  .https.onCall(async (data, context) => {
    const { idToken } = data || {};
    if (!idToken) {
      throw new functions.https.HttpsError('invalid-argument', 'missing idToken');
    }

    try {
      // 驗證 id_token（使用 LINE Login Channel ID）
      const verifyResp = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          id_token: idToken,
          client_id: process.env.MAIN_LINE_LOGIN_CHANNEL_ID,
        }),
      });
      const verifyJson = await verifyResp.json();
      if (!verifyResp.ok || verifyJson.error) {
        throw new Error(verifyJson.error_description || 'LINE id_token verify failed');
      }

      // 解析 LINE Login 回傳的使用者資訊
      const lineSub = verifyJson.sub;
      const displayName = verifyJson.name || '';
      const picture = verifyJson.picture || '';
      const uid = `line:${lineSub}`;

      // 確保 Firebase 有這個使用者
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

      // 建立 Firebase Custom Token 回傳
      const customToken = await admin.auth().createCustomToken(uid, { provider: 'line' });
      return { customToken, uid };
    } catch (err) {
      console.error('[firebaseCustomToken] error:', err);
      throw new functions.https.HttpsError('unauthenticated', err.message || 'verify failed');
    }
  });


// 匯出：主系統登入驗證 API
exports.authApi = functions
  .region('asia-east1')
  .runWith({ secrets: ['MAIN_LINE_LOGIN_CHANNEL_ID'] })
  .https.onRequest(loginApp);

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

exports.approvePendingAlias = functions.region('asia-east1').https.onCall(async (data, ctx) => {
  try {
    if (!ctx.auth) throw new functions.https.HttpsError('unauthenticated', '請先登入');

    // 兼容 id / pendingId 兩種命名
    const pendingId = data?.pendingId || data?.id;
    const alias = (data?.alias || '').trim();
    const std   = (data?.std || '').trim();

    if (!pendingId) throw new functions.https.HttpsError('invalid-argument', '缺少 pendingId');
    if (!alias)     throw new functions.https.HttpsError('invalid-argument', '缺少 alias');
    if (!std || std.toLowerCase() === 'null')
      throw new functions.https.HttpsError('invalid-argument', '請輸入有效的標準名（std）');

    const now = admin.firestore.FieldValue.serverTimestamp();
    const refKey = db.collection('key_alias').doc(keyIdForFirestore(std));

    const batch = db.batch();
    batch.set(refKey, {
      aliases: admin.firestore.FieldValue.arrayUnion(alias),
      updatedAt: now
    }, { merge: true });
    batch.delete(db.collection('pending_aliases').doc(pendingId));
    await batch.commit();

    return { ok: true, std, alias, pendingId };
  } catch (err) {
    console.error('approvePendingAlias error:', err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('unknown', err.message || 'unknown error');
  }
});

exports.rejectPendingAlias = functions.region('asia-east1').https.onCall(async (data, ctx) => {
  try {
    if (!ctx.auth) throw new functions.https.HttpsError('unauthenticated', '請先登入');

    const pendingId = data?.pendingId || data?.id;
    const alias = (data?.alias || '').trim();
    const reason = (data?.reason || '').trim();

    if (!pendingId) throw new functions.https.HttpsError('invalid-argument', '缺少 pendingId');
    if (!alias)     throw new functions.https.HttpsError('invalid-argument', '缺少 alias');

    const now = admin.firestore.FieldValue.serverTimestamp();
    const norm = alias.trim().toLowerCase();

    const batch = db.batch();
    // 黑名單：之後 normalize 會略過
    batch.set(
      db.collection('rejected_aliases').doc(norm),
      { alias, rejectedAt: now, reason: reason || null },
      { merge: true }
    );
    // 刪 pending
    batch.delete(db.collection('pending_aliases').doc(pendingId));
    await batch.commit();

    return { ok: true, alias, pendingId };
  } catch (err) {
    console.error('rejectPendingAlias error:', err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('unknown', err.message || 'unknown error');
  }
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
  
// === 黑名單過濾工具（你已加，保留） ===
function normAlias(s=''){
  return String(s||'')
    .normalize('NFKC')
    .replace(/[()（）\[\]{}]/g,' ')
    .replace(/[：:|｜/、,，;；\\]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
}

async function loadRejectedAliasSet(){
  const snaps = await admin.firestore().collection('rejected_aliases').get();
  return new Set(snaps.docs.map(d => normAlias(d.id)));
}

// === 黑名單包裝：先濾掉黑名單 key，再交給原本 normalizer ===
async function normalizeData(rawData, { learn = true } = {}) {
  const rejected = await loadRejectedAliasSet();

  // 先把黑名單鍵丟掉（注意：只過濾「鍵」，值的過濾交給前端或你的 base normalizer）
  const filtered = {};
  for (const [k, v] of Object.entries(rawData || {})) {
    if (!rejected.has(normAlias(k))) {
      filtered[k] = v;
    }
  }

  // 交給你原本的 normalizer（就是 ./normalizer 匯入的那個）
  return await baseNormalizeData(filtered, { learn });
}
  
exports.normalizeHealthData = functions
  .region('asia-east1')
  .https.onCall(async (data, context) => {
    const { data: rawData } = data || {};
    if (!rawData) {
      throw new functions.https.HttpsError('invalid-argument', '缺少 data');
    }
    try {
      const { normalized, learned } = await normalizeData(rawData, { learn: true });
      return { normalized, learned };
    } catch (e) {
      console.error('[normalizeHealthData] error:', e);
      throw new functions.https.HttpsError('internal', e.message || 'normalize failed');
    }
  });

// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const REGION = "asia-east1";
const TZ = "Asia/Taipei";

/* ---------- 共用工具 ---------- */

// YYYY-MM-DD（台北時區）
function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 建立/取得當日文件：checkins/{uid}/days/{YYYY-MM-DD}
async function initDay(uid, dateKey) {
  const ref = db.doc(`checkins/${uid}/days/${dateKey}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      total_plans: 1, // 先設 1；之後可由 reminders 推算
      completed_count: 0,
      completion_rate: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return ref;
}

/* ---------- 新增：LINE → Firebase Auth custom token ---------- */
/**
 * 前端流程：
 *  await liff.init({ liffId });
 *  if (!liff.isLoggedIn()) { liff.login(); return; }
 *  const idToken = liff.getIDToken(); // 需 openid scope
 *  const fn = firebase.app().functions("asia-east1").httpsCallable("lineCustomToken");
 *  const { data } = await fn({ idToken });
 *  await firebase.auth().signInWithCustomToken(data.customToken);
 */
exports.lineCustomToken = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    const idToken = data?.idToken;
    if (!idToken) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "idToken is required"
      );
    }

    // 從 functions 環境變數讀取 LINE Channel ID
    // 設定方式：firebase functions:config:set line.channel_id="YOUR_CHANNEL_ID"
    const channelId = functions.config()?.line?.channel_id;
    if (!channelId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Missing functions config: line.channel_id"
      );
    }

    // 驗證 LINE id_token
    // Node 18+ 內建 fetch；若你的 runtime 較舊請改用 node-fetch
    const resp = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });

    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || !payload?.sub) {
      console.error("LINE verify failed:", payload);
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Invalid LINE idToken"
      );
    }

    const lineUserId = payload.sub; // LINE 的 user id
    const uid = `line:${lineUserId}`;

    // 確保 Firebase Auth 有這個使用者
    try {
      await admin.auth().getUser(uid);
    } catch {
      await admin.auth().createUser({ uid });
    }

    const customToken = await admin.auth().createCustomToken(uid);
    return { customToken };
  });

/* ---------- 你的簽到相關 callable（原樣保留，區域一致） ---------- */

// ✅ 簽到
exports.markReminderDone = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }
    const uid = context.auth.uid;
    const dateKey = data?.dateKey || todayKey();

    const ref = await initDay(uid, dateKey);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.data() || {};
      const total = cur.total_plans || 1;
      let done = cur.completed_count || 0;
      done = Math.min(done + 1, total);
      tx.update(ref, {
        completed_count: done,
        completion_rate: total > 0 ? done / total : 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { ok: true };
  });

// ⛔ 取消簽到
exports.undoReminderDone = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }
    const uid = context.auth.uid;
    const dateKey = data?.dateKey || todayKey();

    const ref = await initDay(uid, dateKey);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.data() || {};
      const total = cur.total_plans || 1;
      let done = cur.completed_count || 0;
      done = Math.max(done - 1, 0);
      tx.update(ref, {
        completed_count: done,
        completion_rate: total > 0 ? done / total : 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { ok: true };
  });

// ♻️ 重算（可選）
exports.recalcDay = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "請先登入");
    }
    const uid = context.auth.uid;
    const dateKey = data?.dateKey || todayKey();

    const ref = await initDay(uid, dateKey);
    await ref.set(
      {
        total_plans: 1,
        completed_count: 0,
        completion_rate: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true };
  });

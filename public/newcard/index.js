// functions/index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const TZ = "Asia/Taipei";

// 格式化今天日期 YYYY-MM-DD
function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 初始化當日文件
async function initDay(uid, dateKey) {
  const ref = db.doc(`checkins/${uid}/days/${dateKey}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      total_plans: 1,             // 先設 1，之後你可以接 reminders 算
      completed_count: 0,
      completion_rate: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  return ref;
}

// ✅ 簽到
exports.markReminderDone = functions.region("asia-east1").https.onCall(async (data, context) => {
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

// ⛔ 取消簽到
exports.undoReminderDone = functions.region("asia-east1").https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "請先登入");
  const uid = context.auth.uid;
  const dateKey = data?.dateKey || todayKey();

  const ref = await initDay(uid, dateKey);

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const cur = snap.data() || {};
    let total = cur.total_plans || 1;
    let done = cur.completed_count || 0;
    done = Math.max(done - 1, 0);
    tx.update(ref, {
      completed_count: done,
      completion_rate: total > 0 ? done / total : 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { ok: true };
});

// ♻️ 重算（可選）
exports.recalcDay = functions.region("asia-east1").https.onCall(async (data, context) => {
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

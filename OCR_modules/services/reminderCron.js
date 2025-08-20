// reminderCron.js
const cron = require('node-cron');
const admin = require('firebase-admin');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

// ✅ 每分鐘跑一次，查找即將到期的提醒並推播
function startReminderCron(db, client) {
  cron.schedule('* * * * *', async () => {
    const nowTW = dayjs().tz('Asia/Taipei');
    const minBefore = nowTW;
    const minAfter = nowTW.add(1, 'minute');

    console.log('[cron] 現在台灣時間:', nowTW.format('YYYY-MM-DD HH:mm:ss Z'));

    try {
      const snapshot = await db.collection('time')
        .where('done', '==', false) // 只處理尚未完成的提醒
        .where('datetime', '>=', admin.firestore.Timestamp.fromDate(minBefore.toDate()))
        .where('datetime', '<=', admin.firestore.Timestamp.fromDate(minAfter.toDate()))
        .get();

      console.log(`[cron] 到期提醒筆數: ${snapshot.size}`);

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const userId = data.userId;
        if (!userId) continue;

        const text = data.medicine
          ? `請記得服用藥物：${data.medicine}`
          : '⏰ 到時間囉，請記得用藥！';

        try {
          await client.pushMessage(userId, {
            type: 'template',
            altText: '用藥提醒',
            template: {
              type: 'buttons',
              title: '💊 用藥提醒',
              text,
              actions: [
                {
                  type: 'postback',
                  label: '✅ 簽到',
                  data: `action=checkin&reminderId=${doc.id}`
                }
              ]
            }
          });
          // ✅ 成功推播後，立即將提醒標記為已完成，避免重複推播
         
          console.log('[cron] ✅ 已推播給', userId, '提醒 ID:', doc.id);
        } catch (err) {
          console.error('[cron] ❌ 推播錯誤:', err);
        }
      }
    } catch (err) {
      console.error('[cron] ❌ 定時提醒錯誤:', err);
    }
  });
}

// ✅ 每天 00:01 自動建立當日提醒
function startReminderCron(db, client) {
  cron.schedule('* * * * *', async () => {
    const nowTW = dayjs().tz('Asia/Taipei');
    const minBefore = nowTW.subtract(1, 'minute');
    const minAfter = nowTW.add(1, 'minute');

    try {
      const snapshot = await db.collection('time')
        .where('done', '==', false)
        .where('datetime', '>=', admin.firestore.Timestamp.fromDate(minBefore.toDate()))
        .where('datetime', '<=', admin.firestore.Timestamp.fromDate(minAfter.toDate()))
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const userId = data.userId;
        if (!userId) continue;

        // ✅ 根據提醒類型決定按鈕文字
        // 您需要在 Firestore 記錄中加入一個 type 欄位來區分單次或重複
        const isRepeating = data.repeatingId ? true : false;
        const buttonLabel = isRepeating ? '✅ 簽到' : '✅ 確認';

        const text = data.medicine
          ? `請記得服用藥物：${data.medicine}`
          : '⏰ 到時間囉，請記得用藥！';

        try {
          await client.pushMessage(userId, {
            type: 'template',
            altText: '用藥提醒',
            template: {
              type: 'buttons',
              title: '💊 用藥提醒',
              text,
              actions: [
                {
                  type: 'postback',
                  label: buttonLabel,
                  data: `action=checkin&reminderId=${doc.id}`
                }
              ]
            }
          });
          // ✅ 成功推播後，立即將提醒標記為已完成，避免重複推播
     
        } catch (err) {
          console.error('[cron] ❌ 推播錯誤:', err);
        }
      }
    } catch (err) {
      console.error('[cron] ❌ 定時提醒錯誤:', err);
    }
  });
}

module.exports = {
  startReminderCron
};
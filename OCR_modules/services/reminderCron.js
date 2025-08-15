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
    const minBefore = nowTW.subtract(1, 'minute');
    const minAfter = nowTW.add(1, 'minute');

    console.log('[cron] 現在台灣時間:', nowTW.format('YYYY-MM-DD HH:mm:ss Z'));

    try {
      const ONLY_USER_IDS = [
        'U4627fdb2f24e8784b75faac9d0ce178a'
      ];

      const snapshot = await db.collection('time')
        .where('done', '==', false)
        .where('datetime', '>=', admin.firestore.Timestamp.fromDate(minBefore.toDate()))
        .where('datetime', '<=', admin.firestore.Timestamp.fromDate(minAfter.toDate()))
        .get();

      console.log(`[cron] 到期提醒筆數: ${snapshot.size}`);

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const userId = data.userId;
        if (!userId || (ONLY_USER_IDS.length && !ONLY_USER_IDS.includes(userId))) continue;

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

// ✅ 每天 00:01 自動建立當日提醒（來自 repeatingReminders 設定）
function startRepeatingReminderGenerator(db) {
  cron.schedule('1 0 * * *', async () => {
    const now = dayjs().tz('Asia/Taipei');
    const todayStr = now.format('YYYY-MM-DD');

    try {
      const repeatingSnapshot = await db.collection('repeatingReminders')
        .where('active', '==', true)
        .get();

      console.log(`[每日生成提醒] 準備建立 ${repeatingSnapshot.size} 筆`);

      for (const doc of repeatingSnapshot.docs) {
        const data = doc.data();
        const userId = data.userId;
        if (!userId) continue;

        const reminderTime = dayjs(`${todayStr} ${data.hour}:${data.minute}`, 'YYYY-MM-DD HH:mm').tz('Asia/Taipei');

        await db.collection('time').add({
          userId,
          datetime: admin.firestore.Timestamp.fromDate(reminderTime.toDate()),
          done: false,
          medicine: data.medicine || '' // 可選：也儲存藥名
        });

        console.log(`[每日生成提醒] 為 ${userId} 建立 ${reminderTime.format()}`);
      }
    } catch (err) {
      console.error('[每日生成提醒] 發生錯誤：', err);
    }
  });
}

module.exports = {
  startReminderCron,
  startRepeatingReminderGenerator
};

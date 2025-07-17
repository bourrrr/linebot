const cron = require('node-cron');
const admin = require('firebase-admin');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

function startReminderCron(db, client) {
  // 每分鐘執行一次
  cron.schedule('* * * * *', async () => {
    // 取得現在台灣時間（精準！）
    const nowTW = dayjs().tz('Asia/Taipei');
    const minBefore = nowTW.subtract(1, 'minute').toDate();
    const minAfter = nowTW.add(1, 'minute').toDate();

    // Debug log
    console.log('[cron] 現在台灣時間:', nowTW.format('YYYY-MM-DD HH:mm:ss Z'));
    console.log('[cron] minBefore:', dayjs(minBefore).format('YYYY-MM-DD HH:mm:ss Z'));
    console.log('[cron] minAfter:', dayjs(minAfter).format('YYYY-MM-DD HH:mm:ss Z'));

    try {
      const usersSnapshot = await db.collection('users').get();
      usersSnapshot.forEach(async (userDoc) => {
        const userId = userDoc.id;
        const remindersRef = db.collection('users').doc(userId).collection('reminders');
        const snapshot = await remindersRef
          .where('done', '==', false)
          .where('datetime', '>=', admin.firestore.Timestamp.fromDate(minBefore))
          .where('datetime', '<=', admin.firestore.Timestamp.fromDate(minAfter))
          .get();

        console.log(`[cron] userId: ${userId} snapshot.size: ${snapshot.size}`);

        snapshot.forEach(async (doc) => {
          const data = doc.data();
          console.log('[cron] 推播用藥提醒:', {
            userId,
            medicine: data.medicine,
            docId: doc.id,
            datetime: data.datetime && data.datetime.toDate && data.datetime.toDate().toISOString()
          });

          await client.pushMessage(userId, {
            type: 'template',
            altText: '用藥提醒',
            template: {
              type: 'buttons',
              title: '💊 用藥提醒',
              text: `請記得服用藥物：${data.medicine}`,
              actions: [
                {
                  type: 'postback',
                  label: '✅ 簽到',
                  data: `action=checkin&reminderId=${doc.id}`
                }
              ]
            }
          });
        });
      });
    } catch (err) {
      console.error('❌ 定時提醒錯誤:', err);
    }
  });
}

module.exports = startReminderCron;

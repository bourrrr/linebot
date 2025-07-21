const cron = require('node-cron');
const admin = require('firebase-admin');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

function startReminderCron(db, client) {
  cron.schedule('* * * * *', async () => {
    const nowTW = dayjs().tz('Asia/Taipei');
    const minBefore = nowTW.subtract(1, 'minute');
    const minAfter = nowTW.add(1, 'minute');

    console.log('[cron] 現在台灣時間:', nowTW.format('YYYY-MM-DD HH:mm:ss Z'));
    console.log('[cron] minBefore:', minBefore.format('YYYY-MM-DD HH:mm:ss Z'));
    console.log('[cron] minAfter:', minAfter.format('YYYY-MM-DD HH:mm:ss Z'));

    try {
      const ONLY_USER_IDS = [
        'U4627fdb2f24e8784b75faac9d0ce178a'
        // 其他 userId 也可以加在這
      ];

      for (const userId of ONLY_USER_IDS) {
        // 直接查 /time 集合，by userId
        const snapshot = await db.collection('time')
          .where('userId', '==', userId)
          .where('done', '==', false)
          .where('datetime', '>=', admin.firestore.Timestamp.fromDate(minBefore.toDate()))
          .where('datetime', '<=', admin.firestore.Timestamp.fromDate(minAfter.toDate()))
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

          try {
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
            console.log('[cron] 已推播給', userId, data.medicine);
          } catch (err) {
            console.error('[cron] 推播失敗:', err);
          }
        });
      }
    } catch (err) {
      console.error('[cron] 定時提醒錯誤:', err);
    }
  });
}

module.exports = startReminderCron;

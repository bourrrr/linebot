const cron = require('node-cron');
const admin = require('firebase-admin');

function startReminderCron(db, client) {
  // 每分鐘執行一次
  cron.schedule('* * * * *', async () => {
    // 計算台灣時間 nowTW
    const now = new Date();
    const taipeiOffset = 8 * 60; // +8時區分鐘
    const nowTW = new Date(now.getTime() + (taipeiOffset - now.getTimezoneOffset()) * 60000);

    const minBefore = new Date(nowTW.getTime() - 60000);
    const minAfter = new Date(nowTW.getTime() + 60000);

    // 每分鐘都印一次 cron 是否有在跑
    console.log('[cron] 任務執行，現在時間(台灣):', nowTW.toISOString());

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

        // 加一行 log 看這個 user 是否有 reminder 資料
        console.log(`[cron] userId: ${userId} snapshot.size: ${snapshot.size}`);

        if (snapshot.size === 0) {
          // 沒有資料的情況也印出來方便 debug
          console.log(`[cron] userId: ${userId} 這分鐘沒有需要推播的提醒`);
        }

        snapshot.forEach(async (doc) => {
          const data = doc.data();
          // 推播前詳細 log
          console.log('[cron] 推播用藥提醒:', {
            userId,
            medicine: data.medicine,
            docId: doc.id,
            datetime: data.datetime && data.datetime.toDate && data.datetime.toDate()
          });

          // 發送提醒訊息
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


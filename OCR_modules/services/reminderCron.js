// OCR_modules/services/reminderCron.js

const cron = require('node-cron');
const admin = require('firebase-admin');

function startReminderCron(db, client) {
  // 每分鐘執行一次
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const minBefore = new Date(now.getTime() - 60000);
    const minAfter = new Date(now.getTime() + 60000);

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

        snapshot.forEach(async (doc) => {
          const data = doc.data();
		console.log('推播用藥提醒:', userId, data.medicine, doc.id, data.datetime && data.datetime.toDate && data.datetime.toDate());
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

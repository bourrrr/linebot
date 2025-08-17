// checkinService.js
const { db } = require('../../firebase');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

async function handleCheckin(event, db, client) {
  const userId = event.source?.userId;
  console.log('[checkin] userId:', userId);

  if (!userId) {
    console.error('[checkin] 無法取得 userId');
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '⚠️ 發生錯誤，請確認帳號是否綁定'
    });
  }

  const todayKey = dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');

  try {
    const snapshot = await db.collection('time')
      .where('userId', '==', userId)
      .where('dateKey', '==', todayKey)
      .get();

    if (snapshot.empty) {
      console.log('[checkin] 今日沒有任何提醒');
      await client.pushMessage(userId, {
        type: 'text',
        text: '你今天沒有任何提醒紀錄唷。'
      });
      return;
    }

    let completed = 0;
    let total = 0;
    let lastReminderId = null;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      total++;
      if (data.done) {
        completed++;
      } else {
        await doc.ref.update({ done: true });
        completed++;
        lastReminderId = doc.id;
      }
    }

    const msg = completed === total
      ? `🎉 今日簽到完成 ${completed}/${total}！你可以抽卡囉！`
      : `✅ 今日進度 ${completed}/${total}，繼續加油唷～`;
    console.log(`[checkin] user: ${userId}, ${completed}/${total} 已簽到`);
    
    await client.pushMessage(userId, {
      type: 'text',
      text: msg
    });

  } catch (err) {
    console.error('[checkin] 錯誤：', err);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '⚠️ 無法完成簽到，請稍後再試。'
    });
  }
}

module.exports = {
  handleCheckin
};

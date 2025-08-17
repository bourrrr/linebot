// checkinService.js
const { db } = require('../../firebase');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

async function handleCheckin(event, db, client) {
  const userId = event.source.userId;
  const todayKey = dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');

  try {
    const snapshot = await db.collection('time')
      .where('userId', '==', userId)
      .where('dateKey', '==', todayKey)
      .get();
	console.log("db typeof:", typeof db, db);

    if (snapshot.empty) {
      await client.replyMessage(event.replyToken, {
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
        // 尚未簽到的提醒 → 設為 done
        await doc.ref.update({ done: true });
        completed++;
        lastReminderId = doc.id;
      }
    }

    const msg = completed === total
      ? `🎉 今日簽到完成 ${completed}/${total}！你可以抽卡囉！`
      : `✅ 今日進度 ${completed}/${total}，繼續加油唷～`;

    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: msg
    });

    // 如果已完成所有提醒，可以推播抽卡 Flex（你可額外實作）
    // TODO: push 抽卡功能 if needed

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

// checkinService.js
const { db } = require('../../firebase');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { replyOrPush } = require('./reminderService'); // ✅ 引入共用工具

dayjs.extend(utc);
dayjs.extend(timezone);

async function handleCheckin(event, db, client) {
  const userId = event.source?.userId;
  const postbackData = event.postback?.data;
  const urlParams = new URLSearchParams(postbackData);
  const reminderId = urlParams.get('reminderId');

  console.log('[checkin] userId:', userId, 'reminderId:', reminderId);

  if (!userId || !reminderId) {
    console.error('[checkin] 無法取得 userId 或 reminderId');
    return replyOrPush(event, client, {
      type: 'text',
      text: '⚠️ 發生錯誤，請確認帳號是否綁定或提醒資訊是否完整。'
    });
  }

  const todayKey = dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');

  try {
    const docRef = db.collection('time').doc(reminderId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log('[checkin] 提醒記錄不存在');
      return replyOrPush(event, client, {
        type: 'text',
        text: '這筆提醒記錄可能已被刪除或已簽到。'
      });
    }

    const data = doc.data();
    if (data.done) {
      return replyOrPush(event, client, {
        type: 'text',
        text: '這筆提醒已經簽到過了唷！'
      });
    }

    // 更新為已完成
    await docRef.update({ done: true });
    console.log(`[checkin] user: ${userId}, 已簽到提醒 ID: ${reminderId}`);

    // 計算今日進度
    const snapshot = await db.collection('time')
      .where('userId', '==', userId)
      .where('dateKey', '==', todayKey)
      .get();

    let completed = 0;
    let total = 0;
    
    for(const d of snapshot.docs) {
      total++;
      if (d.data().done) {
        completed++;
      }
    }

    const msg = completed === total
      ? `🎉 今日所有提醒簽到完成 ${completed}/${total}！你可以抽卡囉！`
      : `✅ 今日進度 ${completed}/${total}，繼續加油唷～`;

    return replyOrPush(event, client, {
      type: 'text',
      text: msg
    });

  } catch (err) {
    console.error('[checkin] 錯誤：', err);
    return replyOrPush(event, client, {
      type: 'text',
      text: '⚠️ 無法完成簽到，請稍後再試。'
    });
  }
}

module.exports = {
  handleCheckin
};
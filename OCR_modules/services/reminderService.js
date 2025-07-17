const { Timestamp } = require('firebase-admin/firestore');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

let reminderCache = {};

async function handleReminderPostback(event, db, client) {
  const userId = event.source.userId;

  // 處理選擇提醒時間
  if (event.type === 'postback' && event.postback.params?.datetime) {
    if (!reminderCache[userId]) reminderCache[userId] = {};
    reminderCache[userId].datetime = event.postback.params.datetime;
    console.log(`【時間選擇】${userId} reminderCache:`, reminderCache[userId]);

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `⏰ 提醒時間設定為 ${event.postback.params.datetime}，請點擊「確認提醒」完成設定。`
    });
  }

  // 處理確認提醒
  if (event.type === 'postback' && event.postback.data === 'action=confirm_reminder') {
    console.log(`【確認提醒】${userId} reminderCache:`, reminderCache[userId]);
    const reminder = reminderCache[userId];
    if (!reminder || !reminder.medicine || !reminder.datetime) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 請先輸入藥名並選擇提醒時間後再點確認'
      });
    }

    const reminderRef = db.collection('users').doc(userId).collection('reminders');
    // 用 dayjs 處理台灣時區（reminder.datetime 格式通常是 "YYYY-MM-DDTHH:mm"）
    const twDate = dayjs(reminder.datetime).tz('Asia/Taipei');
    console.log('寫入 Firestore 的台灣時間:', twDate.format('YYYY-MM-DD HH:mm:ss Z'));

    await reminderRef.add({
      datetime: Timestamp.fromDate(twDate.toDate()),
      done: false,
      medicine: reminder.medicine
    });

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ 已設定提醒：\n藥品：${reminder.medicine}\n時間：${twDate.format('YYYY-MM-DD HH:mm')}`
    });
  }

  return null;
}

module.exports = { handleReminderPostback, reminderCache };

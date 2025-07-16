const { Timestamp } = require('firebase-admin/firestore');

// 宣告全域快取物件
let reminderCache = {};

async function handleReminderPostback(event, db, client) {
  const userId = event.source.userId;

  // 處理選擇提醒時間
  if (event.type === 'postback' && event.postback.params?.datetime) {
    if (!reminderCache[userId]) reminderCache[userId] = {};
    reminderCache[userId].datetime = event.postback.params.datetime;

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `⏰ 提醒時間設定為 ${event.postback.params.datetime}，請點擊「確認提醒」完成設定。`
    });
  }

  // 處理確認提醒
  if (event.type === 'postback' && event.postback.data === 'action=confirm_reminder') {
	   console.log('收到確認提醒:', reminderCache[userId]);
    const reminder = reminderCache[userId];
    if (!reminder || !reminder.medicine || !reminder.datetime) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 請先輸入藥名並選擇提醒時間後再點確認'
      });
    }

    // 寫入 Firebase
    const reminderRef = db.collection('users').doc(userId).collection('reminders');
    await reminderRef.add({
      medicine: reminder.medicine,
      datetime: Timestamp.fromDate(new Date(reminder.datetime)),
      done: false
    });

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ 已設定提醒：\n藥品：${reminder.medicine}\n時間：${reminder.datetime}`
    });
  }

  // 不是這兩種情境就回 null
  return null;
}

// 匯出 reminderCache 讓其他檔案可以用
module.exports = { handleReminderPostback, reminderCache };

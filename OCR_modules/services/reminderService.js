const { Timestamp } = require('firebase-admin/firestore');

// 宣告全域快取物件
let reminderCache = {};

async function handleReminderPostback(event, db, client) {
  const userId = event.source.userId;

  // 處理選擇提醒時間
  if (event.type === 'postback' && event.postback.params?.datetime) {
    if (!reminderCache[userId]) reminderCache[userId] = {};
    reminderCache[userId].datetime = event.postback.params.datetime;
    // Debug log
    console.log(`【時間選擇】${userId} reminderCache:`, reminderCache[userId]);

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `⏰ 提醒時間設定為 ${event.postback.params.datetime}，請點擊「確認提醒」完成設定。`
    });
  }

  // 處理確認提醒
  if (event.type === 'postback' && event.postback.data === 'action=confirm_reminder') {
    // Debug log
    console.log(`【確認提醒】${userId} reminderCache:`, reminderCache[userId]);
    console.log('Firestore 寫入路徑:', `users/${userId}/reminders`);

    const reminder = reminderCache[userId];
    if (!reminder || !reminder.medicine || !reminder.datetime) {
      // 這個訊息會發給用戶，提醒資料沒填齊
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 請先輸入藥名並選擇提醒時間後再點確認'
      });
    }

    // 寫入 Firebase
    const reminderRef = db.collection('users').doc(userId).collection('reminders');
	const datetimeStr = reminder.datetime.length === 16
  ? reminder.datetime + ':00'
  : reminder.datetime;
const datetimeTW = new Date(datetimeStr + '+08:00');
console.log('寫入 Firestore 的 timestamp:', datetimeTW.toISOString());

    await reminderRef.add({
      medicine: reminder.medicine,
      datetime: Timestamp.fromDate(new Date(reminder.datetime)),
      done: false
    });

    // 這個訊息會發給用戶，提醒已設定完成
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

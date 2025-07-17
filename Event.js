// handleEvent.js
module.exports = async function Event(event, client, db) {
  // 處理 LINE postback（簽到）
  if (event.type === 'postback') {
    console.log('收到 postback:', event.postback.data);

    const data = event.postback.data; // 例如 'action=checkin&reminderId=xxxx'
    const params = new URLSearchParams(data);

    if (params.get('action') === 'checkin') {
      const reminderId = params.get('reminderId');
      const userId = event.source.userId;
      // Firestore 更新
      await db.collection('users').doc(userId).collection('reminders').doc(reminderId)
        .update({ done: true });

      // 回覆簽到成功訊息
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '✅ 已完成簽到，恭喜你按時服藥！'
      });
      return;
    }
  }

  // 這裡可以加處理其他事件型別(message, follow等)
};

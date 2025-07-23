// OCR_modules/services/checkinService.js
const { getStorage } = require('firebase-admin/storage');

async function handleCheckin(event, db, client) {
  if (event.type === 'postback' && event.postback.data.startsWith('action=checkin')) {
    const userId = event.source.userId;
    const params = new URLSearchParams(event.postback.data);
    const reminderId = params.get('reminderId');

    if (!reminderId) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 無效的簽到資料'
      });
    }

    // 1. 更新該筆提醒為已完成
    const reminderRef = db.collection('users').doc(userId).collection('reminders').doc(reminderId);
    await reminderRef.update({ done: true });

    // 2. 從 Firebase Storage 隨機抓一張圖片
    const bucket = getStorage().bucket(); // 取得預設 bucket
    const [files] = await bucket.getFiles({ prefix: '長輩圖/' });

    const imageFiles = files.filter(file => file.name.endsWith('.jpg') || file.name.endsWith('.png'));

    if (imageFiles.length === 0) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '簽到成功 ✅，但找不到可用的長輩圖。'
      });
    }

    const randomFile = imageFiles[Math.floor(Math.random() * imageFiles.length)];

    // 取得下載 URL
    const [url] = await randomFile.getSignedUrl({
      action: 'read',
      expires: '2099-12-31'
    });

    // 3. 傳送圖片與訊息
    return client.replyMessage(event.replyToken, [
      {
        type: 'image',
        originalContentUrl: url,
        previewImageUrl: url
      },
      {
        type: 'text',
        text: '🎉 今日藥物已完成服用，繼續保持健康唷 💪'
      }
    ]);
  }

  // 如果不是 checkin，回 null
  return null;
}

module.exports = { handleCheckin };


const { getStorage } = require('firebase-admin/storage');
const admin = require('firebase-admin'); // 如果還需要
async function handleCheckin(event, db, client) {
  if (event.type === 'postback' && event.postback.data.startsWith('action=checkin')) {
    console.log('🟢 [簽到觸發] 收到事件：', JSON.stringify(event, null, 2)); // ✅

    const userId = event.source.userId;
    const params = new URLSearchParams(event.postback.data);
    const reminderId = params.get('reminderId');

    console.log('🔍 [簽到處理] reminderId:', reminderId); // ✅

    if (!reminderId) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 無效的簽到資料'
      });
    }

    try {
      // ✅ 加入 try-catch 包含整段處理
      const reminderRef = db.collection('time').doc(reminderId);
      await reminderRef.update({ done: true });
      console.log('✅ [簽到處理] Firestore 已更新 done=true');

     const bucket = getStorage().bucket('medwell-test1.appspot.com'); 
      const [files] = await bucket.getFiles({ prefix: '長輩圖/' });
      const imageFiles = files.filter(file => file.name.endsWith('.jpg') || file.name.endsWith('.png'));

      if (imageFiles.length === 0) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '簽到成功 ✅，但找不到可用的長輩圖。'
        });
      }

      const randomFile = imageFiles[Math.floor(Math.random() * imageFiles.length)];
      const [url] = await randomFile.getSignedUrl({
        action: 'read',
        expires: '2099-12-31'
      });

      console.log('📸 [長輩圖] 發送圖片連結：', url); // ✅

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
    } catch (err) {
      console.error('❌ [簽到處理] 發生錯誤：', err); // ✅
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 簽到時發生錯誤，請稍後再試'
      });
    }
  }

  return null;
}
module.exports = { handleCheckin };

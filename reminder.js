const cron = require('node-cron');

//用藥提醒
function setupReminders(client) {
  const userId = 'U4627fdb2f24e8784b75faac9d0ce178a';

  // 早上 8 點
  cron.schedule('0 8 * * *', () => {
    sendReminder(client, userId, '早安！記得吃早上的藥喔 💊');
  });

  // 晚上 8 點
  cron.schedule('0 20 * * *', () => {
    sendReminder(client, userId, '晚安前別忘了吃晚上的藥 💊');
  });
}

function sendReminder(client, userId, message) {
  client.pushMessage(userId, { type: 'text', text: message })
    .then(() => console.log('✅ 成功發送提醒訊息'))
    .catch((err) => console.error('❌ 推播錯誤：', err));
}


module.exports = { setupReminders };

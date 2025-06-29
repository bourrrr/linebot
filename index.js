// 引入需要的套件
const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const getRandomRecipe = require('./getRandomRecipe');
const generateRecipeFlex = require('./generateRecipeFlex');


// 建立 Express app
const app = express();
app.use(express.static('public'));
//app.use(express.json());
//admin.initializeApp({
  //credential: admin.credential.cert(serviceAccount),
  //databaseURL: "https://medwell-test1.firebaseio.com"
//});



// LINE Bot 設定
const config = {
  channelAccessToken: '94atJ6+sSP5pXt3wgHHUyNFaaq53Q+hs/nM79XLa4LO5A2LV0UGm7y1kUSLm+29qX16GkZAyOdE2BlxSaBfvl8BGeRLbHgUGQO+AUy8g6/LcdOB7Gdgd2bis2LH0HOuBQmKUVA52SpuTkr7+zFxrVgdB04t89/1O/w1cDnyilFU=',
  channelSecret: '3da6c5c600c1ee5897209607a02b42d9'
};

// 建立 LINE 客戶端
const client = new line.Client(config);



// webhook 接收事件
app.post('/webhook', line.middleware(config), (req, res) => {
  console.log('收到 LINE 的 webhook 事件！');
  res.status(200).send('OK');  // 🔥 這個一定要先回，不然 LINE 會 timeout


  const events = req.body.events;
  if (!events || events.length === 0) return;

  events.forEach((event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      // 🔥 改成這裡！回文字 + 按鈕
	   const userText = event.message.text.trim();

  if (userText === '血壓地圖') {
    const flexMessage = {
      type: 'flex',
      altText: '台灣血壓站地圖',
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: 'https://www.hpa.gov.tw/images/logo.svg',
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover',
          action: {
            type: 'uri',
            uri: 'https://linebot-o8nr.onrender.com/bp_map.html' // ⚠️ 本機測試網址
          }
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '台灣血壓站地圖',
              weight: 'bold',
              size: 'lg'
            },
            {
              type: 'text',
              text: '點我查看全台血壓站位置地圖！',
              size: 'sm',
              wrap: true,
              color: '#666666'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '開啟地圖',
                uri: 'https://linebot-o8nr.onrender.com/bp_map.html'
              }
            }
          ]
        }
      }
    };

    client.replyMessage(event.replyToken, flexMessage);
    return;
  }
  if (userText === '飲食推薦') {
  getRandomRecipe()
    .then((recipe) => {
      if (!recipe) {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '目前沒有食譜資料喔～'
        });
      }

      const flex = generateRecipeFlex(recipe);
      return client.replyMessage(event.replyToken, flex);
    })
    .catch((err) => {
      console.error('❌ 食譜錯誤：', err);
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '推薦失敗，請稍後再試！'
      });
    });

  return; // 提前結束
}

      client.replyMessage(event.replyToken, {
        type: 'text',
        text: '請選擇你要的功能 👇',
        quickReply: {
          items: [
            {
              type: 'action',
              action: {
                type: 'message',
                label: '吃藥提醒',
                text: '我要吃藥'
              }
            },
            {
              type: 'action',
              action: {
                type: 'message',
                label: '運動提醒',
                text: '我要運動'
              }
            },
            {
              type: 'action',
              action: {
                type: 'message',
                label: '其他',
                text: '我要其他服務'
              }
            }
          ]
        }
      });
    }
  });
});



// 🕗 每天早上 8 點提醒吃藥
cron.schedule('0 8 * * *', () => {
  sendReminder('早安！記得吃早上的藥喔 💊');
});

// 🕗 每天晚上 8 點提醒吃藥
cron.schedule('0 20 * * *', () => {
  sendReminder('晚安前別忘了吃晚上的藥 💊');
});

// 傳送提醒訊息的 function
function sendReminder(message) {
  const userId = 'U4627fdb2f24e8784b75faac9d0ce178a'; // ★★★ 換成你的 LINE User ID
  client.pushMessage(userId, {
    type: 'text',
    text: message
  })
  .then(() => {
    console.log('✅ 成功發送提醒訊息');
  })
  .catch((err) => {
    console.error('❌ 推播錯誤：', err);
  });
}

// 讓 Express 可以解析 JSON
app.use(express.json());
// 啟動伺服器
app.listen(3000, () => {
  console.log('伺服器啟動，監聽在 3000 port！');
});

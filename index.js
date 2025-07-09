// 引入需要的套件
const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const getRandomRecipe = require('./getRandomRecipe');
const generateRecipeFlex = require('./generateRecipeFlex');
const admin = require('firebase-admin');
const serviceAccount = require('/etc/secrets/firebaseKey.json');
const saveImage = require("./OCR_modules/saveImage"); // 儲存圖片
const runOCR = require("./OCR_modules/ocr"); 
const healthCard = require("./OCR_modules/flex/healthCard.js"); 
console.log('📦 saveImage 模組載入成功');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://medwell-test1.firebaseio.com"
  });
}
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

app.post('/webhook', line.middleware(config), async (req, res) => {
  console.log('收到 LINE 的 webhook 事件！');
  const events = req.body.events;
  if (!events || events.length === 0) {
    res.status(200).send('OK');
    return;
  }
  await Promise.all(events.map(event => handleEvent(event, client)));
  res.status(200).send('OK');
});

// 所有訊息統一處理函式
async function handleEvent(event, client) {
  // 1. Flex 功能卡片
  
  if (msg === '健康紀錄') {
  return client.replyMessage(event.replyToken, healthflex);
}

  if (event.type === "message" && event.message.type === "text") {
    const msg = event.message.text.trim();

    // --- 血壓地圖 ---
    if (msg === '血壓地圖') {
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
              uri: 'https://linebot-o8nr.onrender.com/bp_map.html'
            }
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: '台灣血壓站地圖', weight: 'bold', size: 'lg' },
              { type: 'text', text: '點我查看全台血壓站位置地圖！', size: 'sm', wrap: true, color: '#666666' }
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
      return client.replyMessage(event.replyToken, flexMessage);
    }

    // --- 飲食推薦 ---
    if (msg === '飲食推薦') {
      try {
        const recipe = await getRandomRecipe();
        if (!recipe) {
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '目前沒有食譜資料喔～'
          });
        }
        const flex = generateRecipeFlex(recipe);
        return client.replyMessage(event.replyToken, flex);
      } catch (err) {
        console.error('❌ 食譜錯誤：', err);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '推薦失敗，請稍後再試！'
        });
      }
    }


    // --- 健康紀錄 Flex 卡片 ---
    if (msg === "紀錄數據") {
      return client.replyMessage(event.replyToken, healthCard);
    }

    // --- 點新增紀錄 Quick Reply ---
    if (msg === "我要新增紀錄") {
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "請拍照或上傳您的處方箋圖片：",
        quickReply: {
          items: [
            {
              type: "action",
              action: { type: "camera", label: "打開相機" }
            },
            {
              type: "action",
              action: { type: "cameraRoll", label: "從相簿選擇" }
            }
          ]
        }
      });
    }

    // --- 預設 quick reply ---
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "請選擇你要的功能 👇",
      quickReply: {
        items: [
          { type: "action", action: { type: "message", label: "吃藥提醒", text: "我要吃藥" } },
          { type: "action", action: { type: "message", label: "運動提醒", text: "我要運動" } },
          { type: "action", action: { type: "message", label: "其他", text: "我要其他服務" } }
        ]
      }
    });
  }

  

  // 3. 其他事件先不處理
  return Promise.resolve(null);
}

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
  const userId = '你的 user id'; // ⚠️請換成你自己的 LINE User ID
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
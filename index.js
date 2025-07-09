// 引入需要的套件
const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const getRandomRecipe = require('./getRandomRecipe');
const generateRecipeFlex = require('./generateRecipeFlex');
const admin = require('firebase-admin');
const serviceAccount = require('/etc/secrets/firebaseKey.json');
const saveImage = require('./OCR_modules/saveImage');
const runOCR = require('./OCR_modules/ocr');
const healthCard = require('./OCR_modules/flex/healthCard');

console.log('📦 saveImage 模組載入成功');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://medwell-test1.firebaseio.com'
  });
}

const app = express();
app.use(express.static('public'));
app.use(express.json());

// LINE Bot 設定
const config = {
  channelAccessToken: '94atJ6+sSP5pXt3wgHHUyNFaaq53Q+hs/nM79XLa4LO5A2LV0UGm7y1kUSLm+29qX16GkZAyOdE2BlxSaBfvl8BGeRLbHgUGQO+AUy8g6/LcdOB7Gdgd2bis2LH0HOuBQmKUVA52SpuTkr7+zFxrVgdB04t89/1O/w1cDnyilFU=',
  channelSecret: '3da6c5c600c1ee5897209607a02b42d9'
};

const client = new line.Client(config);

app.post('/webhook', line.middleware(config), async (req, res) => {
  console.log('收到 LINE 的 webhook 事件！');
  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).send('OK');
  await Promise.all(events.map(event => handleEvent(event, client)));
  res.status(200).send('OK');
});

// 處理訊息事件
async function handleEvent(event, client) {
  if (event.type === 'message' && event.message.type === 'text') {
    const msg = event.message.text.trim();

    if (msg === '血壓地圖') {
      const flex = {
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
            action: { type: 'uri', uri: 'https://linebot-o8nr.onrender.com/bp_map.html' }
          },
          body: {
            type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: '台灣血壓站地圖', weight: 'bold', size: 'lg' },
              { type: 'text', text: '點我查看全台血壓站位置地圖！', size: 'sm', wrap: true, color: '#666666' }
            ]
          },
          footer: {
            type: 'box', layout: 'vertical', contents: [
              { type: 'button', action: { type: 'uri', label: '開啟地圖', uri: 'https://linebot-o8nr.onrender.com/bp_map.html' } }
            ]
          }
        }
      };
      return client.replyMessage(event.replyToken, flex);
    }

    if (msg === '飲食推薦') {
      try {
        const recipe = await getRandomRecipe();
        if (!recipe) return client.replyMessage(event.replyToken, { type: 'text', text: '目前沒有食譜資料喔～' });
        const flex = generateRecipeFlex(recipe);
        return client.replyMessage(event.replyToken, flex);
      } catch (err) {
        console.error('❌ 食譜錯誤：', err);
        return client.replyMessage(event.replyToken, { type: 'text', text: '推薦失敗，請稍後再試！' });
      }
    }

    if (msg === '健康紀錄') {
      const healthDataFlex = {
        type: 'flex',
        altText: '健康數據紀錄',
        contents: {
          type: 'bubble',
          hero: {
            type: 'image',
            url: 'https://cdn-icons-png.flaticon.com/512/535/535285.png',
            size: 'full',
            aspectRatio: '20:13',
            aspectMode: 'cover',
            action: { type: 'uri', uri: 'https://medwell-test1.web.app/健康數據1.html' }
          },
          body: {
            type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: '健康數據紀錄', weight: 'bold', size: 'xl' },
              { type: 'text', text: '查看你的血壓、血糖與脈搏趨勢', size: 'sm', color: '#666666', wrap: true }
            ]
          },
          footer: {
            type: 'box', layout: 'vertical', contents: [
              { type: 'button', style: 'primary', action: { type: 'uri', label: '查看紀錄', uri: 'https://medwell-test1.web.app/健康數據1.html' } }
            ]
          }
        }
      };
      return client.replyMessage(event.replyToken, healthDataFlex);
    }

    if (msg === '紀錄數據') {
      return client.replyMessage(event.replyToken, healthCard);
    }

    if (msg === '我要新增紀錄') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '請拍照或上傳您的處方箋圖片：',
        quickReply: {
          items: [
            { type: 'action', action: { type: 'camera', label: '打開相機' } },
            { type: 'action', action: { type: 'cameraRoll', label: '從相簿選擇' } }
          ]
        }
      });
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '請選擇你要的功能 👇',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '吃藥提醒', text: '我要吃藥' } },
          { type: 'action', action: { type: 'message', label: '運動提醒', text: '我要運動' } },
          { type: 'action', action: { type: 'message', label: '其他', text: '我要其他服務' } }
        ]
      }
    });
  }

  if (event.type === 'message' && event.message.type === 'image') {
    try {
      const msgId = event.message.id;
      const imagePath = await saveImage(msgId, client);
      const ocrText = await runOCR(imagePath);
      return client.replyMessage(event.replyToken, { type: 'text', text: `🧾 OCR 辨識結果：\n${ocrText}` });
    } catch (err) {
      console.error('處理失敗：', err);
      return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 系統處理圖片時發生錯誤。' });
    }
  }

  return Promise.resolve(null);
}

cron.schedule('0 8 * * *', () => sendReminder('早安！記得吃早上的藥喔 💊'));
cron.schedule('0 20 * * *', () => sendReminder('晚安前別忘了吃晚上的藥 💊'));

function sendReminder(message) {
  const userId = '你的 user id'; // 請改為你自己的 LINE 使用者 ID
  client.pushMessage(userId, { type: 'text', text: message })
    .then(() => console.log('✅ 成功發送提醒訊息'))
    .catch(err => console.error('❌ 推播錯誤：', err));
}

app.listen(3000, () => {
  console.log('伺服器啟動，監聽在 3000 port！');
});

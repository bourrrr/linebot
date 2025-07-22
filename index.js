// 引入套件
const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const startReminderCron = require('./OCR_modules/services/reminderCron');
console.log('🔥 This is the REAL index.js 正在執行！');
require('module-alias/register');


// 模組載入
const healthCard = require('./OCR_modules/healthFlex');
const saveImage = require('./OCR_modules/saveImage');
const runOCR = require('./OCR_modules/ocr');
const madmapflex = require('./OCR_modules/flex/madmapFlex');
const bpMapFlex = require('./OCR_modules/flex/bpMapFlex');
const handleRecipeRecommendation = require('./OCR_modules/flex/recipeHandler');
const generateHealthFlex = require('./OCR_modules/flex/healthDataCard');
const reminderBubble = require('./OCR_modules/flex/reminderBubble');
const { handleReminderPostback, reminderCache } = require('./OCR_modules/services/reminderService');
const { handleCheckin } = require('./OCR_modules/services/checkinService');
const Event = require('./Event');

// 環境變數
require('dotenv').config();

const { db, bucket } = require('./firebase'); // ✅ 引入 bucket，會觸發 firebase.js 裡的 console.log



// 建立 Express app
const app = express();
app.use(express.static('public'));

// LINE Bot 設定
const config = {
  channelAccessToken: '94atJ6+sSP5pXt3wgHHUyNFaaq53Q+hs/nM79XLa4LO5A2LV0UGm7y1kUSLm+29qX16GkZAyOdE2BlxSaBfvl8BGeRLbHgUGQO+AUy8g6/LcdOB7Gdgd2bis2LH0HOuBQmKUVA52SpuTkr7+zFxrVgdB04t89/1O/w1cDnyilFU=',
  channelSecret: '3da6c5c600c1ee5897209607a02b42d9'
};
const client = new line.Client(config);

startReminderCron(db, client);

// webhook 事件處理
app.post('/webhook', line.middleware(config), async (req, res) => {
  console.log('📩 收到 LINE 的 webhook 事件！');
  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).send('OK');

  await Promise.all(events.map(event => handleEvent(event, client)));
  res.status(200).send('OK');
});

// 處理個別事件
async function handleEvent(event, client) {
  try {
	   if (event.type === "postback") {
      // 加 log 看有沒有收到 postback
      console.log('收到 postback:', JSON.stringify(event, null, 2));

      // 先處理 checkin
      const checkinResult = await handleCheckin(event, client); // ✅ 只傳 event 和 client

      if (checkinResult) return checkinResult;

      // 再處理用藥提醒
      const reminderResult = await handleReminderPostback(event, db, client);
      if (reminderResult) return reminderResult;

      // 其他 postback 可以加更多分支
      return;
    }

    if (event.type === "message" && event.message.type === "text") {
      const msg = event.message.text.trim();
	if (!["藥局地圖", "血壓地圖", "紀錄數據", "健康數據紀錄", "飲食推薦", "用藥提醒", "我要新增紀錄"].includes(msg)) {
			const userId = event.source.userId;
			if (!reminderCache[userId]) reminderCache[userId] = {};
			reminderCache[userId].medicine = msg;
			console.log('藥名輸入後 reminderCache:', reminderCache[userId]);
		  }
      if (msg === '藥局地圖') {
        return client.replyMessage(event.replyToken, [
          { type: 'text', text: '📡 已收到您的指令，請點擊下方地圖開啟藥局搜尋功能 👇' },
          madmapflex()
        ]);
      }
	  const checkinResult = await handleCheckin(event, client);
	  if (checkinResult) return checkinResult;
	const reminderResult = await handleReminderPostback(event, db, client);
	  if (reminderResult) return reminderResult;
	  
      if (msg === '血壓地圖') {
        return client.replyMessage(event.replyToken, bpMapFlex);
      }

      if (msg === '紀錄數據') {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '✅ 你輸入了紀錄數據'
        });
      }
	  
      if (msg === '健康數據紀錄') {
        console.log("✅ 收到紀錄數據指令");
        return client.replyMessage(event.replyToken, healthCard);
      }

      if (msg === '飲食推薦') {
        return handleRecipeRecommendation(event, client);
      }

	  if (msg === '用藥提醒') {
      return client.replyMessage(event.replyToken, {
        type: 'flex',
        altText: '設定用藥提醒',
        contents: reminderBubble
      });
    }
      if (msg === '我要新增紀錄') {
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "請拍照或上傳您的處方箋圖片：",
          quickReply: {
            items: [
              { type: "action", action: { type: "camera", label: "打開相機" } },
              { type: "action", action: { type: "cameraRoll", label: "從相簿選擇" } }
            ]
          }
        });
      }


    }
  } catch (err) {
    console.error("❌ handleEvent 錯誤：", err);
  }
}

// 🕗 定時吃藥提醒（每天早上8點、晚上8點）
cron.schedule('0 8 * * *', () => sendReminder('早安！記得吃早上的藥喔 💊'));
cron.schedule('0 20 * * *', () => sendReminder('晚安前別忘了吃晚上的藥 💊'));

function sendReminder(message) {
  const userId = '你的_user_id'; // ← ⚠️ 請改為實際的 LINE user ID
  client.pushMessage(userId, {
    type: 'text',
    text: message
  }).then(() => console.log('✅ 推播成功')).catch(err => console.error('❌ 推播錯誤：', err));
}

// 圖片上傳處理
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `ocr_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

app.post('/upload', upload.single('image'), async (req, res) => {
  const filePath = req.file.path;
  try {
    const text = await runOCR(filePath);
    const bpMatch = text.match(/(\d{2,3})\/(\d{2,3})/);
    const sugarMatch = text.match(/血糖[:：]?\s*(\d{2,3})/);

    const resultData = {
      timestamp: new Date().toISOString(),
      pressure: bpMatch ? bpMatch[0] : '',
      sugar: sugarMatch ? sugarMatch[1] : '',
      rawText: text
    };

    const resultFile = `result_${Date.now()}.json`;
    const resultPath = path.join(uploadDir, resultFile);
    fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2), 'utf-8');

    res.json({ success: true, ...resultData, resultFile });
  } catch (err) {
    console.error("❌ OCR 錯誤：", err);
    res.status(500).json({ success: false, message: "OCR 失敗" });
  }
});

// 測試首頁
app.get('/', (req, res) => {
  res.send('MakeWell LINE Bot Server is running!');
});
app.use(express.json());
// 啟動伺服器
app.listen(3000, () => {
  console.log('🚀 伺服器啟動成功，監聽 port 3000！');
});

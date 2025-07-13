const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const healthCard = require('./OCR_modules/healthFlex');
const serviceAccount = require('/etc/secrets/firebaseKey.json');
const saveImage = require('./OCR_modules/saveImage');
const runOCR = require('./OCR_modules/ocr');
const madmapflex = require('./OCR_modules/flex/madmapFlex');
const bpMapFlex = require('./OCR_modules/flex/bpMapFlex');
const handleRecipeRecommendation = require('./OCR_modules/flex/recipeHandler');
const generateHealthFlex = require('./OCR_modules/flex/healthDataCard');

console.log('📦 模組載入成功');

// 初始化 Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://medwell-test1.firebaseio.com"
  });
}

// 建立 Express app
const app = express();
app.use(express.static('public'));


// LINE Bot 設定
const config = {
  channelAccessToken: '94atJ6+sSP5pXt3wgHHUyNFaaq53Q+hs/nM79XLa4LO5A2LV0UGm7y1kUSLm+29qX16GkZAyOdE2BlxSaBfvl8BGeRLbHgUGQO+AUy8g6/LcdOB7Gdgd2bis2LH0HOuBQmKUVA52SpuTkr7+zFxrVgdB04t89/1O/w1cDnyilFU=',
  channelSecret: '3da6c5c600c1ee5897209607a02b42d9'
};
const client = new line.Client(config);

// webhook 接收事件
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

// 處理事件邏輯
async function handleEvent(event, client) {
  if (event.type === "message" && event.message.type === "text") {
    const msg = event.message.text.trim();

	if (msg === '藥局地圖') {
	  const flexMessage = madmapflex(); // 呼叫模組並取得 Flex 卡片物件
	   return client.replyMessage(event.replyToken, [
		{
		  type: 'text',
		  text: '📡 已收到您的指令，請點擊下方地圖開啟藥局搜尋功能 👇'
		},
		flexMessage
	  ]);
	}

	if (msg === '血壓地圖') {
	  return client.replyMessage(event.replyToken, bpMapFlex);
	}

	if (msg === "紀錄數據") 
	{
	  return client.replyMessage(event.replyToken, 
	  {
		type: 'text',
		text: '✅ 你輸入了紀錄數據'
	  });
	}
	
	if (msg === "健康數據紀錄") 
	{
		  console.log("✅ 收到紀錄數據指令"); // ← 新增這行
	  return client.replyMessage(event.replyToken, healthCard);
	}
	
	if (msg === '飲食推薦') {
	  return handleRecipeRecommendation(event, client);
	}




    if (msg === "我要新增紀錄") {
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
  

  return Promise.resolve(null);
}
 if (event.type === "message" && event.message.type === "image") {
    const msgId = event.message.id;
    try {
      const imagePath = await saveImage(msgId, client);
      const ocrText = await runOCR(imagePath);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: `🧾 OCR 辨識結果：\n${ocrText}`
      });
    } catch (err) {
      console.error("❌ OCR 錯誤：", err);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "⚠️ 系統處理圖片時發生錯誤。"
      });
    }
  }

  return Promise.resolve(null);
}

// 定時推播提醒
cron.schedule('0 8 * * *', () => sendReminder('早安！記得吃早上的藥喔 💊'));
cron.schedule('0 20 * * *', () => sendReminder('晚安前別忘了吃晚上的藥 💊'));

function sendReminder(message) {
  const userId = '你的 LINE userId';
  client.pushMessage(userId, {
    type: 'text',
    text: message
  }).then(() => console.log('✅ 成功發送提醒訊息'))
    .catch(err => console.error('❌ 推播錯誤：', err));
}

// ========== 上傳圖片 & 儲存 OCR 結果 ==========
const uploadDir = "C:/Users/mexx0/linebot/OCR_modules";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `ocr_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

app.post('/upload', upload.single('image'), async (req, res) => {
  const filePath = req.file.path;
  try {
    const text = await runOCR(filePath);

    const bpMatch = text.match(/(\d{2,3})\/(\d{2,3})/);
    const sugarMatch = text.match(/血糖[:：]?\s*(\d{2,3})/);

    const pressure = bpMatch ? bpMatch[0] : "";
    const sugar = sugarMatch ? sugarMatch[1] : "";

    const resultData = {
      timestamp: new Date().toISOString(),
      pressure,
      sugar,
      rawText: text
    };

    const resultFilename = `result_${Date.now()}.json`;
    const resultPath = path.join(uploadDir, resultFilename);
    fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2), "utf-8");

    res.json({
      success: true,
      ocrText: text,
      pressure,
      sugar,
      resultFile: resultFilename
    });
  } catch (err) {
    console.error("❌ OCR 錯誤：", err);
    res.status(500).json({ success: false, message: "OCR 失敗" });
  }
});

app.use(express.json());
// 啟動伺服器
app.listen(3000, () => {
  console.log('伺服器啟動，監聽在 3000 port！');
});
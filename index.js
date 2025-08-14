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
const cors = require("cors");
require('dotenv').config();



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
const extractHealthData = require('./OCR_modules/extractHealthData');
const loginFlex = require('./OCR_modules/flex/loginFlex');
const googleVisionOCR = require('./visionOCR/visionOCR');
const upload = multer({ dest: 'uploads/' });
const medicineReminderFlex = require('./OCR_modules/flex/timeflex'); // 或 './OCR_modules/flex.js'
const generateRecipeFlex = require('./generateRecipeFlex');

const cardflex = require('./OCR_modules/flex/cardflex');
// 環境變數
require('dotenv').config();


const { db, bucket } = require('./firebase'); // ✅ 引入 bucket，會觸發 firebase.js 裡的 console.log



// 建立 Express app
const app = express();
app.use(express.static('public'));
app.use(cors({ origin: true }));
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
// 1. 取得最新健康紀錄
async function getLatestHealthRecord(userId) {
  const snapshot = await db.collection("health_records")
    .where("userId", "==", userId)
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].data();
}

// 2. 串OpenAI
const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // .env裡面要有 OPENAI_API_KEY=你的金鑰

async function analyzeHealthData(record) {
  let prompt = "請依據以下健康紀錄，給出10-30字健康分析建議，並判斷這筆資料推薦哪種類型的飲食(如低鹽、高纖、低糖)，不要直接顯示原始數值：\n";
  Object.entries(record.data).forEach(([k, v]) => {
    prompt += `${k}:${v}\n`;
  });
  prompt += "\n請以簡明中文回覆健康建議（不超過30字），並給一個適合的飲食方向（僅需類型，如'高纖飲食'）。";
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 80,
    temperature: 0.5
  });
  return response.choices[0].message.content;
}
async function getDietFlexByType(type) {
  if (!type) return { type: "text", text: "暫時沒有推薦的食譜。" };
  // 直接用 AI 回傳的 type 當食譜名稱查詢
  let snapshot = await db.collection('recipes').where('name', '==', type).limit(1).get();

  // 查不到就隨機給一筆預設
  if (snapshot.empty) {
    const all = await db.collection('recipes').get();
    if (all.empty) return { type: "text", text: "資料庫沒有任何食譜！" };
    const fallback = all.docs[Math.floor(Math.random() * all.size)].data();
    return generateRecipeFlex(fallback);
  }
  const recipe = snapshot.docs[0].data();
  return generateRecipeFlex(recipe);
}
// 3. Flex推薦組合
async function replyHealthWithDiet(event, client, userId) {
  const record = await getLatestHealthRecord(userId);
  if (!record) {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "找不到您的健康數據，請先上傳記錄！"
    });
  }
  const aiResult = await analyzeHealthData(record);
  const match = aiResult.match(/飲食方向[:：]?\s*([^\n]*)/);
  const dietType = match ? match[1].trim() : "均衡飲食";
  // 這裡用你現有的 getDietFlexByType 取得食譜Flex卡
  const dietFlex = await getDietFlexByType(dietType);

  dietFlex.contents.body.contents.push({
    type: "text",
    text: "MakeWell建議：" + aiResult.split("飲食方向")[0].replace("建議：", "").trim(),
    wrap: true,
    size: "sm",
    color: "#433e7c",
    margin: "md"
  });
  return client.replyMessage(event.replyToken, {
    type: "flex",
    altText: "您的健康紀錄與飲食建議",
    contents: dietFlex.contents
  });
}

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
         
          madmapflex
        ]);
      }
	  if (msg === '健康AI分析') {
  return replyHealthWithDiet(event, client, event.source.userId);
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

      if (msg === '飲食推薦') 
	  {
        return handleRecipeRecommendation(event, client);
      }
	  if (msg === '簽到') 
		{
			return client.replyMessage(event.replyToken, cardflex());
		}
	if (msg.startsWith('步驟 ')) {
	  const recipeName = msg.replace('步驟 ', '').trim();
	  // 查 Firestore
	  const snapshot = await db.collection('recipes').where('name', '==', recipeName).limit(1).get();
	  if (snapshot.empty) {
		return client.replyMessage(event.replyToken, {
		  type: "text",
		  text: `查無「${recipeName}」的步驟！`
		});
	  }
	  const data = snapshot.docs[0].data();
	  const steps = data.steps || [];
	  const stepMsg = steps.map((s, idx) => `步驟${idx + 1}：${s}`).join('\n');
	  return client.replyMessage(event.replyToken, {
		type: "text",
		text: stepMsg
	  });
	}


	  if (msg === '用藥提醒') {
		return client.replyMessage(event.replyToken, [
	  
	  {
        type: 'flex',
        altText: '設定用藥提醒',
        contents: reminderBubble
	  }
      ]);
    }
	if (msg === '志工配對') {
    console.log("✅ 收到志工配對指令");
    return client.replyMessage(event.replyToken, loginFlex());
}


    }
  } catch (err) {
    console.error("❌ handleEvent 錯誤：", err);
  }
}

// 🕗 定時吃藥提醒（每天早上8點、晚上8點）
cron.schedule('0 8 * * *', () => sendReminder('早安！記得吃早上的藥喔 💊'));
cron.schedule('0 20 * * *', () => sendReminder('晚安前別忘了吃晚上的藥 💊'));





// 取代整段 /api/ocr
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: '沒有圖片檔案' });
  }
  try {
    // 1) OCR 成純文字
    const rawText = await googleVisionOCR(req.file.path);

    // 2) 刪暫存檔
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }

    // 3) 用 extractHealthData 先把健康欄位解析好
    // 會得到 { fieldsSuggested, metrics, segmentsFallback, lineCount }
    const parsed = extractHealthData(rawText);

    // 4) 為了相容前端的 parseOCRResultFlexible，
    //    把已整理好的欄位先串成「欄位: 值」的行，前置在 text
    const kvLines = Object.entries(parsed.fieldsSuggested || {})
      .filter(([k, v]) => k && v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    // 5) 回傳格式：前端 ocr_data2.html 會用到 text 與 fieldsSuggested
    return res.json({
      ok: true,
      text: kvLines ? `${kvLines}\n\n${rawText}` : rawText,
      ...parsed
    });
  } catch (err) {
    console.error('OCR/解析錯誤：', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});




// 4. (建議保留測試首頁) 
app.get('/', (req, res) => {
  res.send('MakeWell LINE Bot Server is running!');
});

// 測試首頁
app.get('/', (req, res) => {
  res.send('MakeWell LINE Bot Server is running!');
});
app.use(express.json());
// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動成功，監聽 port 3000！ ${PORT}`);
});

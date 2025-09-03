// 引入套件
const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
console.log('🔥 This is the REAL index.js 正在執行！');
require('module-alias/register');
const cors = require("cors");
require('dotenv').config();
// ---- 時區設定（只在 index.js 放一次就好）----
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);


// 模組載入
const healthCard = require('./OCR_modules/healthFlex');
const saveImage = require('./OCR_modules/saveImage');
const runOCR = require('./OCR_modules/ocr');
const madmapflex = require('./OCR_modules/flex/madmapFlex');
const bpMapFlex = require('./OCR_modules/flex/bpMapFlex');
const handleRecipeRecommendation = require('./OCR_modules/flex/recipeHandler');
const generateHealthFlex = require('./OCR_modules/flex/healthDataCard');
const reminderBubble = require('./OCR_modules/flex/reminderBubble');

const { handleCheckin } = require('./OCR_modules/services/checkinService');
const Event = require('./Event');

const loginFlex = require('./OCR_modules/flex/loginFlex');
const googleVisionOCR = require('./visionOCR/visionOCR');
const upload = multer({ dest: 'uploads/' });
const { buildTimeMenuFlex } = require('./OCR_modules/services/reminderService');
 // 或 './OCR_modules/flex.js'
const generateRecipeFlex = require('./generateRecipeFlex');
const { handleReminderPostback } = require('./OCR_modules/services/reminderService');
const { replyOrPush } = require('./OCR_modules/services/reminderService');
const { sendReminderCarousel } = require('./OCR_modules/services/reminderService');
const cardflex = require('./OCR_modules/flex/cardflex');
const {replyTimePicker, handleSelectTime, handleConfirmReminder, handlePrepareDelete, handleConfirmDelete
} = require('./OCR_modules/services/reminderService');
const buildMoreAdviceFlex = require('./OCR_modules/flex/moreAdviceFlex');
const flexHelp = require('./OCR_modules/flex/flex-help'); 

const { handleHelpPostback } = flexHelp;
console.log({
  hasBuildTimeMenuFlex: typeof buildTimeMenuFlex === 'function',
  hasLoginFlex: typeof loginFlex === 'function',
  hasHandleRecipeRecommendation: typeof handleRecipeRecommendation === 'function'
});




const { db, bucket } = require('./firebase'); // ✅ 引入 bucket，會觸發 firebase.js 裡的 console.log

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}



// 建立 Express app
const app = express();
app.use(express.static('public'));
app.use(cors({ origin: true }));
// LINE Bot 設定
const config = {
channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};
if (!config.channelAccessToken || !config.channelSecret) {
  console.error('❌ 缺少 LINE 金鑰，請設定 CHANNEL_ACCESS_TOKEN / CHANNEL_SECRET');
  process.exit(1);
}
const client = new line.Client(config);
const {
  startReminderCron,
  startRepeatingReminderGenerator
} = require('./OCR_modules/services/reminderCron');
startReminderCron(db, client);

const processedTokens =
  globalThis.__processedTokens || (globalThis.__processedTokens = new Set());
// webhook 事件處理
app.post('/webhook', line.middleware(config), async (req, res) => {
  console.log('📩 收到 LINE 的 webhook 事件！');
  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).send('OK');

  await Promise.all(
  events.map(async (event) => {
    try {
      await handleEvent(event, client);
    } catch (err) {
      console.error('❌ handleEvent failed:', err);
    }
  })
);
  res.status(200).send('OK');
});
// ====== 自動推送：監聽 health_records 新增，產生 AI 建議 + 食譜推播 ======

// 文字版溫馨排版
function formatWarmAdvice(adviceText = '') {
  const lines = (adviceText || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      if (/^1\)/.test(s)) return s.replace(/^1\)/, '💖 '); // 風險與重點
      if (/^2\)/.test(s)) return s.replace(/^2\)/, '🌿 '); // 飲食調整
      if (/^3\)/.test(s)) return s.replace(/^3\)/, '☀️ '); // 作息運動
      if (/^4\)/.test(s)) return s.replace(/^4\)/, '🏡 '); // 就醫提醒
      if (/^[\-\•\·\*]/.test(s)) return '• ' + s.replace(/^[\-\•\·\*]\s*/, '');
      return '• ' + s;
    });

  let text = `🌸 MakeWell 詳細建議\n${lines.join('\n')}\n\n想看其他食譜卡片可點擊：飲食推薦`;
  if (text.length > 1950) text = text.slice(0, 1950) + '…'; // LINE 文字上限保險
  return text;
}
let autoDietWatcherStarted = false;
function startAutoDietPush() {
  if (autoDietWatcherStarted) return; // 防止重複註冊
  autoDietWatcherStarted = true;
  console.log('🚀 啟動 health_records 即時監聽（自動食譜推播）');

  db.collection('health_records')
    .where('source', '==', 'liff')           // 只處理 LIFF 來源
    .where('autoDietPushed', '==', false)    // 只處理尚未推送
    .orderBy('timestamp', 'desc')
    .onSnapshot((snap) => {
      snap.docChanges().forEach(async (chg) => {
        if (chg.type !== 'added') return;

        const doc = chg.doc;
        const data = doc.data() || {};
        const userId = data.userId;
        if (!userId) return;

        try {
          const aiResult = await analyzeHealthData(data);
          const match = aiResult.match(/飲食方向[:：]?\s*([^\n]*)/);
          const dietType = match ? match[1].trim() : '均衡飲食';

          // 取得食譜卡並插入 MakeWell 建議
          const dietFlex = await getDietFlexByType(dietType);
          dietFlex.contents.body.contents.push({
			  type: "text",
			  text: "MakeWell建議：" + aiResult.split("飲食方向")[0].replace("建議：", "").trim(),
			  wrap: true,
			  size: "sm",
			  color: "#433e7c",
			  margin: "md"
			});

			// 確保有 footer
			if (!dietFlex.contents.footer) {
			  dietFlex.contents.footer = {
				type: "box",
				layout: "vertical",
				spacing: "sm",
				contents: []
			  };
			}

			// 加入「更多建議」按鈕
			dietFlex.contents.footer.contents.push({
			  type: "button",
			  style: "primary",
			  height: "sm",
			  action: {
				type: "message",
				label: "更多建議",
				text: "更多建議"
			  },
			  color: "#588157"
			});

          // ✅ 只推播一次
          await client.pushMessage(userId, {
            type: 'flex',
            altText: '自動健康食譜建議',
            contents: dietFlex.contents
          });

          // 標記已推送，避免重複
          await doc.ref.update({
            autoDietPushed: true,
            autoDietPushedAt: admin.firestore.FieldValue.serverTimestamp(),
            aiSummary: aiResult,
            aiDietType: dietType
          });

          console.log(`✅ 自動推送完成：user=${userId} diet=${dietType}`);
        } catch (err) {
          console.error('❌ 自動推送失敗：', err?.response?.data || err);
        }
      });
    });
}

startAutoDietPush();

// 1. 取得最新健康紀錄
// 取得某使用者最新一筆健康紀錄（預設只抓 LIFF 來源）
async function getLatestHealthRecord(userId, opts = { onlyLiff: true }) {
  if (!userId) return null;

  let q = db.collection('health_records')
            .where('userId', '==', userId);

  if (opts.onlyLiff) {
    q = q.where('source', '==', 'liff'); // 只處理 LIFF 上傳
  }

  q = q.orderBy('timestamp', 'desc').limit(1);

  const snapshot = await q.get();
  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return { id: doc.id, ref: doc.ref, ...doc.data() }; // 回傳含 docId/參照與資料
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
// ==== 直接覆蓋原本的 handleEvent ====

    // ==== 直接覆蓋整個 handleEvent ====
async function handleEvent(event, client) {
  try {
    // 去重
    if (event.deliveryContext?.isRedelivery) return;
    if (event.replyToken) {
      if (processedTokens.has(event.replyToken)) return;
      processedTokens.add(event.replyToken);
      setTimeout(() => processedTokens.delete(event.replyToken), 60 * 1000);
    }


  

  // ② 開啟功能（需要用「文字流程」啟動的三個）
// === Postback 統一處理（完整覆蓋原本的 postback 區塊）===
if (event.type === 'postback') {
  const data = event.postback?.data || '';
  console.log('[postback]', data);

  // ① Rich Menu 切換
  if (data.startsWith('switch=')) {
    const menuType = data.split('=')[1]; // 'care' | 'service'
    try { await switchRichMenu(event.source.userId, menuType); }
    catch (e) { console.error('切換 Rich Menu 失敗:', e); }
    return;
  }

  // ② 開啟功能：三個走文字流程
  if (data.startsWith('help=launch')) {
    const q = new URLSearchParams(data);
    const key = q.get('key') || '';

    if (key === 'reminder') {
      try {
        const flex = buildTimeMenuFlex();          // 用藥提醒 → 時段選單卡
        await client.replyMessage(event.replyToken, flex);
      } catch (e) {
        console.error('reminder launch error:', e);
        await client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 用藥提醒暫時無法開啟' });
      }
      return;
    }
    if (key === 'pairing') {
      await client.replyMessage(event.replyToken, loginFlex());   // 志工配對 → 起始卡
      return;
    }
    if (key === 'diet') {
      await handleRecipeRecommendation(event, client);            // 飲食推薦 → 推薦流程
      return;
    }

    // 其它（藥局地圖/健康數據/圖鑑）若沒設 URI 就提示
    await client.replyMessage(event.replyToken, { type: 'text', text: `「${key}」尚未設定開啟方式` });
    return;
  }

  // ③ 先交給 flex-help（包含：help=open&key=pharmacy、help=menu）
  const handledByHelp = await flexHelp.handleHelpPostback(client, event);
  if (handledByHelp) return;

  // ④ 其它 Postback（提醒/簽到等）
  const handledByReminder = await handleReminderPostback(event, db, client);
  if (handledByReminder) return;

  const handledByCheckin = await handleCheckin(event, db, client);
  if (handledByCheckin) return;

  console.warn('未處理的 postback:', data);
  return;
}



    // 2) 再處理文字訊息（請不要在這裡再判斷 postback）
    if (event.type === 'message' && event.message.type === 'text') {
      const msg = (event.message.text || '').trim();

      if (msg === '藥局地圖') {
        return client.replyMessage(event.replyToken, [madmapflex]);
      }
      if (msg === '健康AI分析') {
        return replyHealthWithDiet(event, client, event.source.userId);
      }
      if (msg === '簽到') {
        return client.replyMessage(event.replyToken, cardflex());
      }
      if (msg === '血壓地圖') {
        return client.replyMessage(event.replyToken, bpMapFlex);
      }
      if (msg === '紀錄數據') {
        return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 你輸入了紀錄數據' });
      }
      if (msg === '健康數據紀錄') {
        return client.replyMessage(event.replyToken, healthCard);
      }
      if (msg === '飲食推薦') {
        return handleRecipeRecommendation(event, client);
      }
	   if (msg === '功能' || msg === '幫助' || msg === '功能說明') {
	  return client.replyMessage(
		event.replyToken,
		flexHelp.buildFeatureShopStyleCarousel(flexHelp.FEATURE_CARDS)
	  );
	}
  
      if (msg.startsWith('步驟 ')) {
        const recipeName = msg.replace('步驟 ', '').trim();
        const snapshot = await db.collection('recipes').where('name', '==', recipeName).limit(1).get();
        if (snapshot.empty) {
          return client.replyMessage(event.replyToken, { type: 'text', text: `查無「${recipeName}」的步驟！` });
        }
        const data = snapshot.docs[0].data();
        const steps = data.steps || [];
        const stepMsg = steps.map((s, i) => `步驟${i + 1}：${s}`).join('\n');
        return client.replyMessage(event.replyToken, { type: 'text', text: stepMsg });
      }
      if (msg === '用藥提醒') {
        try {
          const flex = buildTimeMenuFlex();
          return client.replyMessage(event.replyToken, flex);
        } catch (error) {
          console.error('Flex Message 錯誤:', error);
          return client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 用藥提醒暫時無法使用' });
        }
      }
      if (msg === '志工配對') {
        return client.replyMessage(event.replyToken, loginFlex());
      }
      if (msg === '切換到健康照護') {
        try {
          await switchRichMenu(event.source.userId, 'service');
          return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已切換到健康照護選單' });
        } catch (error) {
          return client.replyMessage(event.replyToken, { type: 'text', text: '❌ 選單切換失敗，請稍後再試' });
        }
      }
      if (msg === '切換到社區服務') {
        try {
          await switchRichMenu(event.source.userId, 'care');
          return client.replyMessage(event.replyToken, { type: 'text', text: '✅ 已切換到社區服務選單' });
        } catch (error) {
          return client.replyMessage(event.replyToken, { type: 'text', text: '❌ 選單切換失敗，請稍後再試' });
        }
      }

      if (msg === '更多建議') {
        const record = await getLatestHealthRecord(event.source.userId);
        if (!record) {
          return client.replyMessage(event.replyToken, { type: 'text', text: '找不到您的健康數據，請先上傳記錄！' });
        }
        const detailPrompt = [
          '請以專業健康管理師口吻，針對以下健康紀錄提供「較詳細」建議：',
          '1) 可能的風險與重點（勿誇大）',
          '2) 一週可行的飲食調整（列點、分早餐/午餐/晚餐）',
          '3) 生活作息與運動建議（簡明列點）',
          '4) 若有可疑異常，提醒就醫但避免醫療診斷',
          '（請保持總字數約 100–150 字，中文回答）',
          '',
          ...Object.entries(record.data).map(([k, v]) => `${k}: ${v}`)
        ].join('\n');

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: detailPrompt }],
          max_tokens: 360,
          temperature: 0.6
        });

        const advice = response.choices[0].message.content?.trim()
          || '目前無法產生建議，稍後再試看看。';

        const text = formatWarmAdvice(advice);
        return client.replyMessage(event.replyToken, { type: 'text', text });
      }

      return;
    }
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data, null, 2) : (err.message || String(err));
    console.error('❌ handleEvent error:', detail);
  }
}


// 🕗 定時吃藥提醒（每天早上8點、晚上8點）

// index.js
async function sendReminder(client, userId, messageObject) {
  // messageObject 可以是 text / template / flex 等
  return client.pushMessage(userId, messageObject);
}






const ocrRouter = require('./routes/ocr'); // 不需要副檔名 .js 也行
app.use('/api', ocrRouter);
app.get('/health', (_, res) => res.send('ok'));










// 在 index.js 中找到 Rich Menu 相關的引用，替換為：
// === Rich Menu: 重建 & 換圖 API ===
const {
  rebuildRichMenus,
  updateRichMenuImage,
  switchRichMenu,
  getCurrentRichMenuIds
} = require('./OCR_modules/menu/richmenu-setup');

// 重建兩個 Rich Menu（用 message 切換機制）
app.get('/rebuild-richmenus', async (_req, res) => {
  try {
    const result = await rebuildRichMenus();
    res.json({ ok: true, result });
  } catch (e) {
    console.error('⚠️ 重建 Rich Menu 失敗:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 只換圖：?menu=care|service 或給 alias；&file=相對路徑
app.get('/update-richmenu-image', async (req, res) => {
  try {
    const menu = req.query.menu || req.query.alias; // 兩種寫法都支援
    const file = req.query.file;
    if (!menu || !file) {
      return res.status(400).json({ ok: false, error: '缺少 menu/alias 或 file 參數' });
    }
    const result = await updateRichMenuImage(menu, file);
    res.json({ ok: true, result });
  } catch (e) {
    console.error('⚠️ 更新 Rich Menu 圖片失敗:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
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


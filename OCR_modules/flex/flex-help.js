/**
 * flex-help.js
 * 6 功能商店風格 Carousel + 使用說明 Bubble
 * 「開啟功能」：若有 it.uri -> 直接 URI；否則 fallback 到 postback: help=launch&key=xxx
 */

const COLORS = {
  primary: "#588157",    // 重綠
  secondary: "#659963",
  gray: "#8e8e8cf2",
  light: "#efede9",      // 小奶黃
  neutral: "#dad7cd",    // 奶灰
  black: "#363636"
};

// ✅ 直接吃環境變數，沒填就留空（會走 fallback postback）
const FEATURE_CARDS = [
  { key: 'pharmacy', title: '藥局地圖',   subtitle: '找附近藥局，一鍵導航',         image: 'https://picsum.photos/800/533?pharmacy', uri: 'https://medwell-test1.web.app/map/madmap.html'},
  { key: 'diet',     title: '飲食推薦',   subtitle: '🤔想不到要吃什麼嗎？🍴\n💡讓我來幫你出主意！👩‍🍳',         image: 'https://picsum.photos/800/533?diet'},
  { key: 'pairing',  title: '志工配對',   subtitle: '陪診/領藥一鍵媒合',             image: 'https://picsum.photos/800/533?pairing'},
  { key: 'records',  title: '健康數據紀錄', subtitle: '✨依健康紀錄讓AI推薦給您最佳菜單建議\n✨還可以立即給你更多健康建議',           image: 'https://picsum.photos/800/533?records',  uri: 'https://medwell-test1.web.app/ocr_data1.html' },
  { key: 'reminder', title: '用藥提醒',   subtitle: '到點通知＋簽到統計',             image: 'https://picsum.photos/800/533?reminder' },
  { key: 'pokedex',  title: '圖鑑',       subtitle: '抽卡蒐集，記錄成就',             image: 'https://picsum.photos/800/533?pokedex',  uri: 'medwell-test1.web.app/newcard/collection.html' },
];

// 使用說明卡片
const USAGE_CARDS = {
  pharmacy: bubbleCard({
    title: '藥局/醫院地圖｜快速上手',
    steps: [
      '先選擇「領藥」或「掛號」',
      '開啟定位，或手動選擇縣市、行政區',
      '用「是否營業中／服務方式」快速篩選',
      '點藥局卡片看資訊，按「導航」即可帶路'
    ],
    tips:  ['支援判斷營業中狀態','支援顯示藥局電話、醫院掛號連結']
  }),
  diet: bubbleCard({
    title: '飲食推薦｜怎麼用',
    steps: [
      '點擊「開啟功能」或下方「飲食推薦」🍴',
      '立即出現美味又健康的食譜✨',
      '可搭配健康數據，讓 AI 推薦更符合您身體所需📌'
    ],
    tips:  ['僅供參考，若不適請就醫','搭配規律量測更準確']
  }),
  pairing: bubbleCard({
    title: '志工配對｜如何發出請求',
    steps: [ '選擇請求類型、時間與地點🗂️','志工接受後，系統會建立臨時聊天室🤝','任務結束上傳回報，或逾時自動關閉✅ '],
    tips:  ['身心障礙患者可要求志工證照','志工端支援地圖導航']
  }),
  records: bubbleCard({
    title: '健康數據紀錄｜上傳與查看',
    steps: ['主頁顯示每筆健康紀錄📖 ','右下角「+」可上傳您的健康數據➕ ','上傳「照片」將自動解析數據📷 ','檢查後點「確認」存入紀錄📝 '],
    tips:  [' 就醫後立即上傳最佳','OCR 辨識異常可手動編輯']
  }),
  reminder: bubbleCard({
    title: '用藥提醒｜快速上手',
    steps: [
      '選擇提醒方式 👉 單次提醒⏰ / 重複提醒⏰',
      '單次提醒：僅一次提醒，若未點擊確認，將每分鐘再提醒一次📌 ',
      '重複提醒：可設定星期循環，到點會出現「簽到」按鈕統計🔁 ',
      '重複提醒：當日完成所有提醒，最後一次會送出抽卡連結🎴 '
    ],
    tips:  ['刪除提醒立即生效','每日「簽到」最多可獲 3 次抽卡','提醒訊息若送達 10 次後將不再提醒']
  }),
  pokedex: bubbleCard({
    title: '圖鑑｜抽卡與收藏',
    steps: [
      '透過每日「簽到」獲得抽卡🎲 ',
      '顯示卡片稀有度與收集率⭐ ',
      '可下載或 📤 分享卡片📥 '
    ],
    tips:  ['連續簽到將有加碼🔥','後續可解鎖主題卡包']
  })
};


// === 建立商店風格 Carousel（使用說明：postback；開啟功能：URI or fallback） ===
function buildFeatureShopStyleCarousel(items) {
  return {
    type: "flex",
    altText: "功能選單",
    contents: {
      type: "carousel",
      contents: items.map(it => ({
        type: "bubble",
        hero: it.image ? { type: "image", url: it.image, size: "full", aspectRatio: "20:13", aspectMode: "cover" } : undefined,
        body: {
          type: "box", layout: "vertical", spacing: "md", backgroundColor: COLORS.light,
          contents: [
            { type: "text", text: it.title, weight: "bold", size: "lg", color: COLORS.black },
            { type: "text", text: it.subtitle || "", size: "sm", color: COLORS.gray, wrap: true }
          ]
        },
        footer: {
          type: "box", layout: "horizontal", spacing: "md", backgroundColor: COLORS.light,
          contents: [
            {
              type: "button", style: "primary", color: COLORS.primary,
              action: { type: "postback", label: "使用說明", data: `help=open&key=${it.key}` }
            },
            it.uri
              ? { type: "button", style: "secondary", color: COLORS.primary, action: { type: "uri", label: "開啟功能", uri: it.uri } }
              : { type: "button", style: "primary", color: COLORS.primary, action: { type: "postback", label: "開啟功能", data: `help=launch&key=${it.key}` } }
          ]
        }
      }))
    }
  };
}

// 使用說明 Bubble 範本
function bubbleCard({ title, steps = [], tips = [] }) {
 const stepContents = steps.map((t, i) => ({
  type: "box",
  layout: "baseline",
  spacing: "xs",               // 原本 sm → xs，縮小間距
  contents: [
    {                           // 數字欄位固定寬，不要撐開
      type: "text",
      text: `${i + 1}.`,
      size: "sm",
      color: COLORS.primary,
      flex: 0                   // ★ 重要：不佔多餘空間
    },
    {                           // 正文佔滿剩餘寬度
      type: "text",
      text: t,
      size: "sm",
      wrap: true,
      color: COLORS.black,
      flex: 1                   // ★ 重要：填滿其餘空間
    }
  ]
}));
  const tipContents = tips.length ? [
    { type: "text", text: "小提醒", weight: "bold", size: "sm", margin: "md", color: COLORS.black },
    ...tips.map(t => ({ type: "text", text: `❣ ${t}`, size: "xs", wrap: true, color: COLORS.gray }))
  ] : [];
  return {
    type: "bubble",
    header: {
      type: "box", layout: "vertical",
      contents: [{ type: "text", text: title, weight: "bold", size: "md", color: COLORS.black }],
      backgroundColor: COLORS.neutral
    },
    body: { type: "box", layout: "vertical", spacing: "sm",
      contents: [{ type: "text", text: "使用步驟", weight: "bold", size: "sm", color: COLORS.black }, ...stepContents, ...tipContents]
    },
    footer: {
      type: "box", layout: "vertical", spacing: "md", backgroundColor: COLORS.light,
      contents: [{ type: "button", style: "primary", color: COLORS.primary, action: { type: "postback", label: "返回選單", data: "help=menu" } }]
    }
  };
}

// Postback handler（處理：help=open&key=xxx、help=menu）
async function handleHelpPostback(client, event) {
  const data = event.postback?.data || "";
  if (!data.startsWith("help=")) return false;

  const q = parseQuery(data);
  if (q.help === "open" && q.key) {
    const card = USAGE_CARDS[q.key];
    if (card) {
      await client.replyMessage(event.replyToken, { type: "flex", altText: "功能使用說明", contents: card });
      return true;
    }
  }
  if (q.help === "menu") {
    await client.replyMessage(event.replyToken, buildFeatureShopStyleCarousel(FEATURE_CARDS));
    return true;
  }
  return false;
}

function parseQuery(s) {
  const out = {};
  (s || "").split("&").forEach(p => { const [k, v] = p.split("="); if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || ""); });
  return out;
}
// flex-help.js
async function handleHelpPostback(client, event) {
  const data = event.postback?.data || "";
  if (!data.startsWith("help=")) return false;

  const q = parseQuery(data);
  if (q.help === "open" && q.key) {
    const card = USAGE_CARDS[q.key];
    if (card) {
      try {
        await client.replyMessage(event.replyToken, {
          type: "flex",
          altText: "功能使用說明",
          contents: card
        });
        return true;
      } catch (e) {
        console.error('[reply usage card error]', e?.response?.data || e);
        // 發生錯時先回文字，避免使用者看到空白
        await client.replyMessage(event.replyToken, { type: "text", text: "抱歉，說明卡目前無法顯示。" });
        return true;
      }
    }
  }
  if (q.help === "menu") {
    await client.replyMessage(event.replyToken, buildFeatureShopStyleCarousel(FEATURE_CARDS));
    return true;
  }
  return false;
}

module.exports = {
  FEATURE_CARDS,
  USAGE_CARDS,
  buildFeatureShopStyleCarousel,
  handleHelpPostback
};

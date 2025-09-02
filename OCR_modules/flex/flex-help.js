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
  { key: 'pharmacy', title: '藥局地圖',   subtitle: '找附近藥局，一鍵導航',         image: 'https://picsum.photos/800/533?pharmacy', uri: process.env.LIFF_PHARMACY_URL },
  { key: 'diet',     title: '飲食推薦',   subtitle: '依健康紀錄給菜單建議',         image: 'https://picsum.photos/800/533?diet'},
  { key: 'pairing',  title: '志工配對',   subtitle: '陪診/領藥一鍵媒合',             image: 'https://picsum.photos/800/533?pairing'},
  { key: 'records',  title: '健康數據紀錄', subtitle: '上傳報告、看趨勢',            image: 'https://picsum.photos/800/533?records',  uri: process.env.LIFF_RECORDS_URL },
  { key: 'reminder', title: '用藥提醒',   subtitle: '到點通知＋簽到統計',             image: 'https://picsum.photos/800/533?reminder' },
  { key: 'pokedex',  title: '圖鑑',       subtitle: '抽卡蒐集，記錄成就',             image: 'https://picsum.photos/800/533?pokedex',  uri: process.env.LIFF_POKEDEX_URL },
];

// 使用說明卡片
const USAGE_CARDS = {
  pharmacy: bubbleCard({
    title: '藥局地圖｜快速上手',
    steps: ['開啟定位或選擇縣市、行政區','用「是否營業中／服務方式」快速篩選','點藥局卡片看資訊，按「導航」直接帶路'],
    tips:  ['支援判斷營業中狀態','若地標有誤可回報校正']
  }),
  diet: bubbleCard({
    title: '飲食推薦｜怎麼用',
    steps: ['依最近一次健康紀錄產生建議','可切換早餐/午餐/晚餐與份量','按「更多建議」取得一週菜單'],
    tips:  ['僅供參考，若不適請就醫','搭配規律量測更準確']
  }),
  pairing: bubbleCard({
    title: '志工配對｜如何發出請求',
    steps: ['選擇請求類型與時間地點','志工接受後建立臨時聊天室','任務結束上傳回報或逾時自動關閉'],
    tips:  ['身心障礙患者可要求志工證照','志工端支援地圖導航']
  }),
  records: bubbleCard({
    title: '健康數據紀錄｜上傳與查看',
    steps: ['上傳報告（照片/PDF）自動解析','檢查後「確認」存入紀錄','在圖表頁查看趨勢'],
    tips:  ['就醫後立即上傳最佳','OCR 異常可手動編輯']
  }),
  reminder: bubbleCard({
    title: '用藥提醒｜快速上手',
    steps: ['新增提醒：藥名、時間、頻率','到點推送提醒','點「簽到」統計，完成當日可抽卡'],
    tips:  ['同藥多時段建議分開建','刪除提醒立即生效']
  }),
  pokedex: bubbleCard({
    title: '圖鑑｜抽卡與收藏',
    steps: ['每日完成提醒可抽卡一次','卡片加入圖鑑，顯示稀有度/收集率','可下載或分享卡片'],
    tips:  ['連續簽到可能有加碼','後續可解鎖主題卡包']
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
    type: "box", layout: "baseline", spacing: "sm",
    contents: [
      { type: "text", text: `${i + 1}.`, size: "sm", color: COLORS.primary },
      { type: "text", text: t, size: "sm", wrap: true, color: COLORS.black }
    ]
  }));
  const tipContents = tips.length ? [
    { type: "text", text: "小提醒", weight: "bold", size: "sm", margin: "md", color: COLORS.black },
    ...tips.map(t => ({ type: "text", text: `• ${t}`, size: "xs", wrap: true, color: COLORS.gray }))
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

module.exports = {
  FEATURE_CARDS,
  USAGE_CARDS,
  buildFeatureShopStyleCarousel,
  handleHelpPostback
};

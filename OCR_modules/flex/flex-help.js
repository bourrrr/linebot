/**
 * flex-help.js
 * 多頁功能介紹 + 商店風格 Carousel
 */

const COLORS = {
  primary: "#588157",   // 重綠
  secondary: "#659963de", // 淺綠 (目前沒用到，但可保留)
  gray: "#8e8e8cf2",
  light: "#efede9",    // 小奶黃
  neutral: "#dad7cd",  // 奶灰
  black: "#363636"
};

// 功能清單
const FEATURE_CARDS = [
  { key: 'pharmacy', title: '藥局地圖',   subtitle: '找附近藥局，一鍵導航',         image: 'https://picsum.photos/800/533?pharmacy' },
  { key: 'diet',     title: '飲食推薦',   subtitle: '依健康紀錄給菜單建議',         image: 'https://picsum.photos/800/533?diet' },
  { key: 'pairing',  title: '志工配對',   subtitle: '陪診/領藥一鍵媒合',             image: 'https://picsum.photos/800/533?pairing' },
  { key: 'records',  title: '健康數據紀錄', subtitle: '上傳報告、看趨勢',            image: 'https://picsum.photos/800/533?records' },
  { key: 'reminder', title: '用藥提醒',   subtitle: '到點通知＋簽到統計',             image: 'https://picsum.photos/800/533?reminder' },
  { key: 'pokedex',  title: '圖鑑',       subtitle: '抽卡蒐集，記錄成就',             image: 'https://picsum.photos/800/533?pokedex' },
];

// 使用說明卡片
const USAGE_CARDS = {
  pharmacy: bubbleCard({
    title: '藥局地圖｜快速上手',
    steps: [
      '開啟定位或選擇縣市、行政區',
      '用「是否營業中／服務方式」快速篩選',
      '點藥局卡片看資訊，按「導航」直接帶路',
    ],
    tips: ['支援判斷營業中狀態', '若地標有誤可回報校正']
  }),
  diet: bubbleCard({
    title: '飲食推薦｜怎麼用',
    steps: [
      '系統依最近一次健康紀錄產生餐點建議',
      '可切換早餐/午餐/晚餐與份量',
      '點「更多建議」取得一週菜單版本'
    ],
    tips: ['僅供參考，若不適請先就醫', '搭配規律量測更準確']
  }),
  pairing: bubbleCard({
    title: '志工配對｜如何發出請求',
    steps: [
      '選擇請求類型（陪診 / 領藥）與時間地點',
      '送出後等待志工接受，系統建立臨時聊天室',
      '任務結束後上傳回報照片，或超過時間自動關閉'
    ],
    tips: ['身心障礙患者可設定需專業證照', '志工端支援地圖導航']
  }),
  records: bubbleCard({
    title: '健康數據紀錄｜上傳與查看',
    steps: [
      '上傳醫療報告（拍照或 PDF）→ 系統解析數值',
      '人工檢查後按「確認」存入紀錄',
      '在圖表頁查看趨勢（血壓/血糖/脈搏…）'
    ],
    tips: ['建議就醫後立即上傳', '若 OCR 解析異常，可手動編輯']
  }),
  reminder: bubbleCard({
    title: '用藥提醒｜快速上手',
    steps: [
      '新增提醒 → 輸入藥名、時間與頻率',
      '系統在指定時間推送提醒',
      '點擊「簽到」紀錄服藥，完成當日提醒可抽卡'
    ],
    tips: ['同藥多時段建議分開建立', '刪除提醒會立即生效']
  }),
  pokedex: bubbleCard({
    title: '圖鑑｜抽卡與收藏',
    steps: [
      '每日完成提醒可抽卡一次',
      '抽到的卡會加入圖鑑，查看稀有度與收集率',
      '支援下載單卡或分享給好友'
    ],
    tips: ['連續簽到可能有加碼活動', '之後可解鎖主題卡包']
  })
};

// === 方法 ===

// 商店風格 Carousel
function buildFeatureShopStyleCarousel(items) {
  return {
    type: "flex",
    altText: "功能選單",
    contents: {
      type: "carousel",
      contents: items.map(it => ({
        type: "bubble",
        hero: {
          type: "image",
          url: it.image,
          size: "full",
          aspectRatio: "20:13",
          aspectMode: "cover"
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          backgroundColor: COLORS.light,
          contents: [
            { type: "text", text: it.title, weight: "bold", size: "lg", color: COLORS.black },
            { type: "text", text: it.subtitle || "", size: "sm", color: COLORS.gray, wrap: true }
          ]
        },
        footer: {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          backgroundColor: COLORS.neutral,
          contents: [
            {
              type: "button",
              style: "primary",
              color: COLORS.primary,
              action: { type: "postback", label: "使用說明", data: `help=open&key=${it.key}` }
            },
            {
              type: "button",
              style: "primary",
              color: COLORS.primary,
              action: { type: "postback", label: "開啟功能", data: `help=launch&key=${it.key}` }
            }
          ]
        }
      }))
    }
  };
}

// 使用說明卡片模板
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
    body: {
      type: "box", layout: "vertical", spacing: "sm",
      contents: [
        { type: "text", text: "使用步驟", weight: "bold", size: "sm", color: COLORS.black },
        ...stepContents,
        ...tipContents
      ]
    },
    footer: {
      type: "box", layout: "vertical", spacing: "md",
      contents: [
        {
          type: "button",
          style: "primary",
          color: COLORS.primary,
          action: { type: "postback", label: "返回選單", data: "help=menu" }
        }
      ],
      backgroundColor: COLORS.light
    }
  };
}

// Postback handler
async function handleHelpPostback(client, event) {
  const data = event.postback?.data || "";
  if (!data.startsWith("help=")) return false;

  const q = parseQuery(data);
  const action = q.help || "menu";

  if (action === "open") {
    const card = USAGE_CARDS[q.key];
    if (card) {
      await client.replyMessage(event.replyToken, {
        type: "flex",
        altText: "功能使用說明",
        contents: card
      });
      return true;
    }
  }

  // 回到選單
  if (action === "menu") {
    await client.replyMessage(event.replyToken, buildFeatureShopStyleCarousel(FEATURE_CARDS));
    return true;
  }

  return false;
}

// 工具
function parseQuery(s) {
  const out = {};
  s.split("&").forEach(p => {
    const [k, v] = p.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || "");
  });
  return out;
}

module.exports = {
  FEATURE_CARDS,
  USAGE_CARDS,
  buildFeatureShopStyleCarousel,
  handleHelpPostback
};
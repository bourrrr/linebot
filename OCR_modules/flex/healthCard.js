// modules/flex/healthCard.js
const healthCard = {
  type: "flex",
  altText: "健康數據紀錄",
  contents: {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "健康紀錄", weight: "bold", size: "lg" }]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "6/25 血壓：120/80 mmHg\n脈搏：76/min",
          size: "sm"
        },
        {
          type: "text",
          text: "6/24 血糖：98 mg/dL",
          size: "sm"
        }
      ]
    },
    footer: {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "button",
          action: {
            type: "message",
            label: "➕ 新增紀錄",
            text: "我要新增紀錄"
          },
          style: "primary",
          color: "#00B900"
        }
      ]
    }
  }
};

module.exports = healthCard;

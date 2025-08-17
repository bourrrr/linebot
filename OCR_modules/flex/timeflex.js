// timeflex.js
// Flex（互動版）：保留說明，並在 footer 放一顆「選擇時間」按鈕（postback）
// 按下後，伺服器再回 Template buttons + datetimepicker
// timeflex.js
// 只負責輸出 Flex（按鈕 UI），不包含任何功能邏輯
function buildTimeMenuFlex() {
  return {
 "type": "flex",
  "altText": "用藥提醒操作",
  "contents": {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "spacing": "md",
      "contents": [
        {
          "type": "text",
          "text": "💊 用藥提醒操作",
          "weight": "bold",
          "size": "lg",
          "color": "#333"
        },
        {
          "type": "text",
          "text": "請選擇要進行的操作：",
          "size": "sm",
          "color": "#666"
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "spacing": "sm",
      "contents": [
        {
          "type": "button",
          "style": "primary",
          "action": {
            "type": "postback",
            "label": "新增提醒時間 🕒",
            "data": "action=open_time_picker"
          }
        },
        {
          "type": "button",
          "style": "secondary",
          "action": {
            "type": "postback",
            "label": "查看我的提醒 📋",
            "data": "action=list_reminders"
            }
          }
        ]
      }
    }
  };
}

module.exports = { buildTimeMenuFlex };




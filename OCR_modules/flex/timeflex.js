// timeflex.js
// 修正版本：確保 Flex Message 格式正確
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
            "color": "#333333"
          },
          {
            "type": "text",
            "text": "請選擇要進行的操作：",
            "size": "sm",
            "color": "#666666",
            "wrap": true
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
              "label": "新增提醒時間",
              "data": "action=open_time_picker"
            }
          },
          {
            "type": "button",
            "style": "secondary",
            "action": {
              "type": "postback",
              "label": "查看我的提醒",
              "data": "action=list_reminders"
            }
          }
        ]
      }
    }
  };
}

module.exports = { buildTimeMenuFlex };
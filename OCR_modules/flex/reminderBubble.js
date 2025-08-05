const reminderBubble = {
  type: "bubble",
  size: "mega",
  body: {
    type: "box",
    layout: "vertical",
    spacing: "md",
    contents: [
      {
        type: "text",
        text: "💊 用藥提醒設定",
        weight: "bold",
        size: "xl"
      },
      {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "text",
            text: "請按照上方步驟說明操作",
            size: "xxl",
            color: "#555555",
            wrap: true
          }
        ]
      }
    ]
  },
  footer: {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      {
        type: "button",
        style: "primary",
        action: {
          type: "datetimepicker",
          label: "選擇提醒時間",
          data: "action=set_time",
          mode: "datetime"
        }
      },
      {
        type: "button",
        style: "primary",
        action: {
          type: "postback",
          label: "✅ 確認提醒",
          data: "action=confirm_reminder"
        }
      }
    ]
  }
};
module.exports = reminderBubble;
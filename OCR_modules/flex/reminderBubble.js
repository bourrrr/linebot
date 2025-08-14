const reminderBubble = {
type: 'bubble',
  body: {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: '💊 用藥提醒時間設定',
        weight: 'bold',
        size: 'lg',
        color: '#333333',
        margin: 'md'
      },
      {
        type: 'text',
        text: '請依步驟操作：',
        size: 'md',
        color: '#222222',
        margin: 'md'
      },
      {
        type: 'box',
        layout: 'vertical',
        margin: 'sm',
        contents: [
          {
            type: 'text',
            text: '1️⃣ 點擊下方按鈕「選擇時間」',
            size: 'sm',
            color: '#0084ff',
            margin: 'xl'
          },
          {
            type: 'text',
            text: '2️⃣ 在彈出的視窗按「確認提醒」完成',
            size: 'sm',
            color: '#00aa55',
            margin: 'xl'
          }
        ]
      }
    ]
  },
  footer: {
    type: 'box',
    layout: 'vertical',
    spacing: 'md',
    contents: [
      {
        type: 'button',
        style: 'primary',
        height: 'sm',
        action: {
          type: 'postback',
          label: '選擇時間',
          data: 'action=open_time_picker' // 你在 webhook 收到這個後，回一則 Template buttons + datetimepicker
        }
      }
    ]
  }
};
module.exports = reminderBubble;
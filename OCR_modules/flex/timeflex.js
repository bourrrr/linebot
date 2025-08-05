// timeflex.js
// flex.js
const medicineReminderFlex = {
  type: 'bubble',
  body: {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: '💊 用藥提醒設定操作',
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
            text: '1️⃣ 請先在本聊天室輸入「藥名」',
            size: 'sm',
            color: '#ff5551',
            margin: 'xl'
          },
          {
            type: 'text',
            text: '2️⃣  再點擊設定「提醒時間」按鈕設定時間',
            size: 'sm',
            color: '#0084ff',
            margin: 'xl'
          }
        ]
      }
    ]
  }
};
module.exports = medicineReminderFlex;

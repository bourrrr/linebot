// 血壓地圖

function handleBpMapRequest(client, event) {
  const flexMessage = {
    type: 'flex',
    altText: '台灣血壓站地圖',
    contents: {
      type: 'bubble',
      hero: {
        type: 'image',
        url: 'https://www.hpa.gov.tw/images/logo.svg',
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
        action: {
          type: 'uri',
          uri: 'https://linebot-o8nr.onrender.com/bp_map.html'
        }
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '台灣血壓站地圖',
            weight: 'bold',
            size: 'lg'
          },
          {
            type: 'text',
            text: '點我查看全台血壓站位置地圖！',
            size: 'sm',
            wrap: true,
            color: '#666666'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '開啟地圖',
              uri: https://linebot-o8nr.onrender.com/bp_map.html'
            }
          }
        ]
      }
    }
  };

  return client.replyMessage(event.replyToken, flexMessage);
}

// 快速回覆選單
function getQuickReply() {
  return {
    type: 'text',
    text: '請選擇你要的功能 👇',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '吃藥提醒',
            text: '我要吃藥'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '運動提醒',
            text: '我要運動'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '其他',
            text: '我要其他服務'
          }
        }
      ]
    }
  };
}

// ⛳️ 匯出
module.exports = { handleBpMapRequest, getQuickReply };

// OCR_modules/flex/bpMapFlex.js

const bpMapFlex = {
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
        { type: 'text', text: '台灣血壓站地圖', weight: 'bold', size: 'lg' },
        { type: 'text', text: '點我查看全台血壓站位置地圖！', size: 'sm', wrap: true, color: '#666666' }
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
            uri: 'https://linebot-o8nr.onrender.com/bp_map.html'
          }
        }
      ]
    }
  }
};

module.exports = bpMapFlex;

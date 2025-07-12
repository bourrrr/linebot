// madmapFlex.js
// madmapFlex.js
module.exports = function madmapFlex() {
  return {
    type: 'flex',
    altText: '藥局搜尋地圖',
    contents: {
      type: 'bubble',
      hero: {
        type: 'image',
        url: 'https://cdn-icons-png.flaticon.com/512/2972/2972615.png',
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover',
        action: {
          type: 'uri',
          uri: 'https://medwell-test1.web.app/madmap.html' // ← 替換為你的實際網址
        }
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '藥局搜尋地圖',
            weight: 'bold',
            size: 'xl'
          },
          {
            type: 'text',
            text: '點我查看附近藥局與營業資訊',
            size: 'sm',
            color: '#666666',
            wrap: true
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
              label: '查看地圖',
              uri: 'https://medwell-test1.web.app/madmap.html' // ← 同上，確認網址無誤
            },
            style: 'primary'
          }
        ]
      }
    }
  };
};

module.exports = madmapflex;

// OCR_modules/flex/healthFlex.js

const healthflex = {
  type: 'flex',
  altText: '健康數據紀錄',
  contents: {
    type: 'bubble',
    hero: {
      type: 'image',
      url: 'https://cdn-icons-png.flaticon.com/512/535/535285.png',
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
      action: {
        type: 'uri',
        uri: 'https://medwell-test1.web.app/健康數據1.html'
      }
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '健康數據紀錄',
          weight: 'bold',
          size: 'xl'
        },
        {
          type: 'text',
          text: '查看你的血壓、血糖與脈搏趨勢',
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
            label: '查看紀錄',
            uri: 'https://medwell-test1.web.app/健康數據1.html'
          },
          style: 'primary'
        }
      ]
    }
  }
};

module.exports = healthflex;

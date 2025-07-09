const healthCard = {
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
        uri: 'https://medwell-test1.web.app/ocr_data1.html?ts=20250710'
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
          style: 'primary',
          action: {
            type: 'uri',
            label: '查看紀錄',
            uri: 'uri: https://medwell-test1.web.app/ocr_data1.html?ts=20250710'
'
          }
        }
      ]
    }
  }
};

module.exports = healthCard;

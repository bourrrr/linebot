// healthDataCard.js

function generateHealthFlex(data) {
  return {
    type: 'flex',
    altText: '健康紀錄卡片',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📊 健康紀錄', weight: 'bold', size: 'xl' },
          { type: 'text', text: `血壓：${data.bloodPressure || '－'}` },
          { type: 'text', text: `血糖：${data.bloodSugar || '－'}` },
          { type: 'text', text: `脈搏：${data.pulse || '－'}` },
          { type: 'text', text: `紀錄時間：${data.data || '－'}` }
        ]
      }
    }
  };
}

module.exports = generateHealthFlex;
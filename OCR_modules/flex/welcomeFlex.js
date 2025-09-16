// OCR_modules/flex/welcomeFlex.js
const { buildService555Link } = require('../services/util');

const LINE_GREEN = '#06C755';

function buildWelcomeFlex(taskId) {
  return {
    type: 'flex',
    altText: '歡迎加入 MakeWell',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '歡迎加入 MakeWell', weight: 'bold', size: 'lg' },
          { type: 'text', text: '快速開始', size: 'sm', color: '#8e8e8c' },
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: LINE_GREEN,
            action: { type: 'uri', label: '志工服務555', uri: buildService555Link(taskId) }
          },
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: LINE_GREEN,
            action: { type: 'message', label: '查看功能', text: '功能' }
          }
        ]
      }
    }
  };
}

module.exports = buildWelcomeFlex;

// OCR_modules/flex/welcomeFlex.js
const { buildService555Link } = require('../services/util'); // ✅ 只從 util 匯入，避免循環引用

const LINE_GREEN = '#06C755';
const HERO_URL = process.env.WELCOME_HERO_URL
  || 'https://medwell-test1.web.app/photo/MakeWell.jpg'; // TODO: 換成你 Firebase Storage 的圖片網址

function buildWelcomeFlex(taskId) {
  return {
    type: 'flex',
    altText: '歡迎加入 MakeWell',
    contents: {
      type: 'bubble',

      // 🔹 上方大圖
      hero: {
        type: 'image',
        url: HERO_URL,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover'
      },

      // 文字區
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '歡迎加入 MakeWell', weight: 'bold', size: 'lg' },
          { type: 'text', text: '快速開始', size: 'sm', color: '#8e8e8c' }
        ]
      },

      // 🔹 只留「志工服務555」這一顆按鈕（已移到 footer）
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: LINE_GREEN,
            action: { type: 'uri', label: '志工服務555', uri: buildService555Link(taskId) }
          }
        ]
      }
    }
  };
}

module.exports = buildWelcomeFlex;

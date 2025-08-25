// OCR_modules/flex/moreAdviceFlex.js
function buildMoreAdviceFlex(adviceText = '') {
  const lines = (adviceText || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      if (/^1\)/.test(s)) s = s.replace(/^1\)/, '💖 1)');
      else if (/^2\)/.test(s)) s = s.replace(/^2\)/, '🌿 2)');
      else if (/^3\)/.test(s)) s = s.replace(/^3\)/, '☀️ 3)');
      else if (/^4\)/.test(s)) s = s.replace(/^4\)/, '🏡 4)');
      return s;
    });

  return {
    type: 'flex',
    altText: 'MakeWell 更多建議',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '🌸 MakeWell 詳細建議', weight: 'bold', size: 'lg', color: '#333' },
          { type: 'text', text: '依你近期健康數據整理', size: 'xs', color: '#666' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: '✨ 重點與建議', weight: 'bold', size: 'md', color: '#588157', margin: 'sm' },
          ...lines.map((t) => ({
            type: 'text',
            text: t,
            wrap: true,
            size: 'sm',
            color: '#444'
          }))
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            color: '#588157',
            action: { type: 'message', label: '回到飲食推薦', text: '飲食推薦' }
          }
        ]
      },
      styles: { header: { separator: true }, footer: { separator: true } }
    }
  };
}

module.exports = buildMoreAdviceFlex;

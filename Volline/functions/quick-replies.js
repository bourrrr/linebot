// quick-replies.js
const admin = require('firebase-admin');

/**
 * 多頁式 Quick Reply：切換對象清單
 * 這裡不要在頂端呼叫 admin.firestore()，
 * 改成在函式內部（已保證 initializeApp 後）再取得。
 */
// === New: 多頁 Flex 卡片清單（每頁 8 張 + 導航 2 張 = 10 張）===
async function renderSwitchCarousel(client, replyToken, fromUserId, page = 1) {
  const db = admin.firestore();
  const qs = await db.collection('matches')
    .where('status','==','active')
    .where('participants','array-contains', fromUserId)
    .orderBy('createdAt','desc')
    .get();

	  if (qs.empty) {
		await client.reply(replyToken, [{ type:'text', text:'目前沒有活躍的配對。' }]);
		return;
	  }

	  const docsAll = qs.docs;

	  // ⭐ 新增：只顯示我當「志工」的配對（排除我當患者的）
	  const docs = docsAll.filter(d => {
		const m = d.data() || {};
		return m.volunteerUserId === fromUserId;  // 只留志工側
	  });

	  if (!docs.length) {
		await client.reply(replyToken, [{ type:'text', text:'目前沒有需要切換的志工對話對象。' }]);
		return;
	  }

	  const PAGE_SIZE = 8;
	  const total = docs.length;
	  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	  const cur = Math.min(Math.max(1, page), totalPages);
	  const start = (cur - 1) * PAGE_SIZE;
	  const slice = docs.slice(start, start + PAGE_SIZE);

  // 建任務卡 bubble
  const bubbles = slice.map(d => {
    const m = d.data() || {};
    const type = (m.taskTitle || m.taskType || '任務').trim();
    const hosp = (m.hospital || '').trim();
    const title = (type + (hosp ? '｜' + hosp : '')).slice(0, 36);

    return {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '切換對話對象', weight: 'bold', size: 'sm', color: '#6e746e' },
          { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
          ...(m.patientName ? [{ type: 'text', text: `患者：${String(m.patientName).slice(0, 20)}`, size:'sm', color:'#6e746e' }] : [])
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'md',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#588157',
            action: { type:'postback', label:'選擇此對象', data:`action=setMatch&matchId=${d.id}` }
          }
        ]
      }
    };
  });

  // 導航卡（上一頁 / 下一頁）
  const navRow = { type:'box', layout:'horizontal', spacing:'md', contents: [] };
  if (cur > 1) {
    navRow.contents.push({
      type:'button', style:'secondary',
      action:{ type:'postback', label:'« 上一頁', data:`action=cardList&page=${cur-1}` }
    });
  }
  navRow.contents.push({
    type:'button', style:'secondary',
    action:{ type:'postback', label:`第 ${cur}/${totalPages} 頁`, data:`action=cardList&page=${cur}` }
  });
  if (cur < totalPages) {
    navRow.contents.push({
      type:'button', style:'secondary',
      action:{ type:'postback', label:'下一頁 »', data:`action=cardList&page=${cur+1}` }
    });
  }

  const navBubble = {
    type:'bubble',
    size:'mega',
    body:{ type:'box', layout:'vertical', spacing:'md', contents:[
      { type:'text', text:'選擇對象（分頁）', weight:'bold', size:'md' },
      { type:'text', text:'請用下方按鈕切換頁面', size:'sm', color:'#6e746e' }
    ]},
    footer:{ type:'box', layout:'vertical', contents:[ navRow ] }
  };

  const contents = [navBubble, ...bubbles]; // 總數 ≤ 10
  await client.reply(replyToken, [{
    type: 'flex',
    altText: `切換對象（第 ${cur}/${totalPages} 頁）`,
    contents: { type:'carousel', contents }
  }]);
}

// 匯出
module.exports = { renderSwitchCarousel };




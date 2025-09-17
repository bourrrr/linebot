// quick-replies.js
const admin = require('firebase-admin');

/**
 * 多頁式 Quick Reply：切換對象清單
 * 這裡不要在頂端呼叫 admin.firestore()，
 * 改成在函式內部（已保證 initializeApp 後）再取得。
 */
async function renderSwitchList(client, replyToken, fromUserId, page = 1) {
  const db = admin.firestore(); // ← 延後到這裡才取用

  const qs = await db.collection('matches')
    .where('status','==','active')
    .where('participants','array-contains', fromUserId)
    .orderBy('createdAt','desc')
    .get();

  if (qs.empty) {
    await client.reply(replyToken, [{ type:'text', text:'目前沒有活躍的配對。' }]);
    return;
  }

  const PAGE_SIZE = 11; // 11 任務 + 上/下一頁 = 13（LINE Quick Reply 上限）
  const docs = qs.docs;
  const total = docs.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(Math.max(1, page), totalPages);
  const start = (cur - 1) * PAGE_SIZE;
  const slice = docs.slice(start, start + PAGE_SIZE);

  const items = slice.map(d => {
    const m = d.data();
    let type = (m.taskTitle || m.taskType || '任務').trim();
    const hosp = (m.hospital || '').trim();
    let label = type || '任務';
    if (hosp) label += '｜' + hosp;
    label = label.slice(0, 20);
    return {
      type: 'action',
      action: {
        type: 'postback',
        label,
        data: `action=setMatch&matchId=${d.id}`
      }
    };
  });

  if (cur > 1) {
    items.unshift({
      type: 'action',
      action: {
        type: 'postback',
        label: '« 上一頁',
        data: `action=listMatches&page=${cur - 1}`
      }
    });
  }
  if (cur < totalPages) {
    items.push({
      type: 'action',
      action: {
        type: 'postback',
        label: '下一頁 »',
        data: `action=listMatches&page=${cur + 1}`
      }
    });
  }

  await client.reply(replyToken, [{
    type: 'text',
    text: `你要跟哪位對話？（第 ${cur}/${totalPages} 頁）`,
    quickReply: { items }
  }]);
}

module.exports = { renderSwitchList };

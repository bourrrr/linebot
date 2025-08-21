// checkinService.js
// 分流簽到：單次 -> 直接完成；重複 -> 記錄當日完成次數與總數（回覆🎉/✅）

const { db } = require('../../firebase'); // 若外層會傳入 db，也可保留此行不影響
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { replyOrPush } = require('./reminderService'); // 共用回覆工具

dayjs.extend(utc);
dayjs.extend(timezone);

function parseQuery(q) {
  return Object.fromEntries(new URLSearchParams(q || ''));
}

function todayKeyTW() {
  return dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');
}

function weekdayIndexTW() {
  return dayjs().tz('Asia/Taipei').day(); // 0..6
}

async function handleCheckin(event, dbArg, client) {
  // 允許使用外部傳入的 db，否則 fallback 到 require 的
  const _db = dbArg || db;

  const userId = event.source?.userId;
  const postbackData = event.postback?.data || '';
  const p = parseQuery(postbackData);
  const type = p.type || 'single'; // 舊版相容：默認當作單次
  const id = p.id || p.reminderId; // 舊版相容：reminderId

  console.log('[checkin] userId:', userId, 'type:', type, 'id:', id);

  if (!userId || !id) {
    console.error('[checkin] 缺少 userId 或 id');
    return replyOrPush(event, client, {
      type: 'text',
      text: '⚠️ 發生錯誤，請確認帳號是否綁定或提醒資訊是否完整。'
    });
  }

  const todayKey = todayKeyTW();

  try {
    if (type === 'single') {
      // ===== 單次提醒：time/{id} -> done: true，單純回覆完成 =====
      const docRef = _db.collection('time').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        console.log('[checkin] 單次提醒不存在');
        return replyOrPush(event, client, { type: 'text', text: '這筆提醒記錄可能已被刪除或已簽到。' });
      }

      const data = doc.data();
      if (data.done) {
        return replyOrPush(event, client, { type: 'text', text: '這筆提醒已經簽到過了唷！' });
      }

      await docRef.update({ done: true });
      console.log(`[checkin] single done: ${id}`);

      // 單次不計入抽卡總結
      return replyOrPush(event, client, { type: 'text', text: '✅ 已完成簽到' });
    }

    // ===== 重複提醒：記錄當日簽到 + 進度 =====
    if (type === 'repeat') {
      const wday = weekdayIndexTW();

      // 1) 先確認這筆重複提醒存在且今天應該生效（active + 包含今天星期）
      const repRef = _db.collection('repeatingReminders').doc(id);
      const repDoc = await repRef.get();
      if (!repDoc.exists) {
        return replyOrPush(event, client, { type: 'text', text: '找不到這筆重複提醒設定。' });
      }
      const rep = repDoc.data();
      if (!rep.active || !Array.isArray(rep.weekdays) || !rep.weekdays.includes(wday)) {
        // 不在今天的重複清單裡，略過但回覆已記錄以避免使用者困惑
        console.log('[checkin] repeat not active today, id=', id, 'wday=', wday);
      }

      // 2) 寫入當日簽到（去重） repeatCheckins/{id}_{YYYY-MM-DD}
      const checkId = `${id}_${todayKey}`;
      const chkRef = _db.collection('repeatCheckins').doc(checkId);
      const chkDoc = await chkRef.get();
      if (!chkDoc.exists) {
        await chkRef.set({
          userId,
          reminderId: id,
          dateKey: todayKey,
          createdAt: new Date()
        });
        console.log('[checkin] repeat logged:', checkId);
      } else {
        console.log('[checkin] repeat already logged:', checkId);
      }

      // 3) 計算今天「總數／完成數」
      //   總數：今天對此 userId 生效的重複提醒數
      //   完成：repeatCheckins 存在的數
      const todayRepeatsSnap = await _db.collection('repeatingReminders')
        .where('userId', '==', userId)
        .where('active', '==', true)
        .where('weekdays', 'array-contains', wday)
        .get();

      const total = todayRepeatsSnap.size;
      let completed = 0;

      // 逐筆檢查是否有今日 checkin 紀錄（以 {reminderId}_{dateKey} 去重）
      const getChecks = [];
      for (const rdoc of todayRepeatsSnap.docs) {
        const rid = rdoc.id;
        const cid = `${rid}_${todayKey}`;
        getChecks.push(_db.collection('repeatCheckins').doc(cid).get());
      }
      const checkDocs = await Promise.all(getChecks);
      completed = checkDocs.filter(d => d.exists).length;

      const msg = (total > 0 && completed === total)
        ? `🎉 今日所有提醒簽到完成 ${completed}/${total}！你可以抽卡囉！`
        : `✅ 今日進度 ${completed}/${total}，繼續加油唷～`;

      return replyOrPush(event, client, { type: 'text', text: msg });
    }

    // 不支援的 type
    return replyOrPush(event, client, { type: 'text', text: '⚠️ 未知的簽到類型。' });

  } catch (err) {
    console.error('[checkin] 錯誤：', err);
    return replyOrPush(event, client, { type: 'text', text: '⚠️ 無法完成簽到，請稍後再試。' });
  }
}

module.exports = { handleCheckin };

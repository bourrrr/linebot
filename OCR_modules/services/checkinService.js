// checkinService.js
const { db } = require('../../firebase');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { replyOrPush } = require('./reminderService');

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

// 👉 抽卡連結（請改成你實際的抽卡頁）
const DRAW_URL = 'https://medwell-test1.web.app/gacha';

// 建立抽卡 Flex
function buildDrawFlex(url) {
  return {
    type: 'flex',
    altText: '抽卡機會 +1',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '🎴 抽卡機會 +1', weight: 'bold', size: 'lg', color: '#333' },
          { type: 'text', text: '恭喜完成今日最後一次提醒！', size: 'sm', color: '#666', wrap: true }
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
            action: { type: 'uri', label: '立即抽卡', uri: url },
            color: '#659963'
          }
        ]
      }
    }
  };
}

// 以交易方式累加「今日抽卡次數」，最多 3 次；回傳 { allowed, count }
async function addDailyDrawIfAvailable(_db, userId, dateKey) {
  const ref = _db.collection('dailyDraws').doc(`${userId}_${dateKey}`);
  return await _db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const curr = snap.exists ? (snap.data().count || 0) : 0;
    if (curr >= 3) {
      return { allowed: false, count: curr };
    }
    const next = curr + 1;
    tx.set(ref, { userId, dateKey, count: next, updatedAt: new Date() }, { merge: true });
    return { allowed: true, count: next };
  });
}

async function handleCheckin(event, dbArg, client) {
  const _db = dbArg || db;

  const userId = event.source?.userId;
  const postbackData = event.postback?.data || '';
  const p = parseQuery(postbackData);
  const type = p.type || 'single';      // 舊版相容
  const id = p.id || p.reminderId;      // 舊版相容

  console.log('[checkin] userId:', userId, 'type:', type, 'id:', id);

  if (!userId || !id) {
    return replyOrPush(event, client, {
      type: 'text',
      text: '⚠️ 發生錯誤，請確認帳號是否綁定或提醒資訊是否完整。'
    });
  }

  const todayKey = todayKeyTW();

  try {
    // ===== 單次：直接完成，不牽涉抽卡 =====
    if (type === 'single') {
      const docRef = _db.collection('time').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return replyOrPush(event, client, { type: 'text', text: '這筆提醒記錄可能已被刪除或已簽到。' });
      }
      if (doc.data().done) {
        return replyOrPush(event, client, { type: 'text', text: '這筆提醒已經簽到過了唷！' });
      }
      await docRef.update({ done: true });
      return replyOrPush(event, client, { type: 'text', text: '✅ 已完成簽到' });
    }

    // ===== 重複：記錄當日簽到 + 若為當日最後一次，評估抽卡 =====
    if (type === 'repeat') {
      const wday = weekdayIndexTW();

      // 驗證設定存在與是否應該生效
      const repRef = _db.collection('repeatingReminders').doc(id);
      const repDoc = await repRef.get();
      if (!repDoc.exists) {
        return replyOrPush(event, client, { type: 'text', text: '找不到這筆重複提醒設定。' });
      }
      const rep = repDoc.data();

      // 記錄今日簽到（去重）
      const checkId = `${id}_${todayKey}`;
      const chkRef = _db.collection('repeatCheckins').doc(checkId);
      const chkDoc = await chkRef.get();
      if (!chkDoc.exists) {
        await chkRef.set({ userId, reminderId: id, dateKey: todayKey, createdAt: new Date() });
      }

      // 計算今日重複提醒總數與完成數
      const todayRepeatsSnap = await _db.collection('repeatingReminders')
        .where('userId', '==', userId)
        .where('active', '==', true)
        .where('weekdays', 'array-contains', wday)
        .get();

      const total = todayRepeatsSnap.size;
      const getChecks = todayRepeatsSnap.docs.map(rdoc =>
        _db.collection('repeatCheckins').doc(`${rdoc.id}_${todayKey}`).get()
      );
      const checkDocs = await Promise.all(getChecks);
      const completed = checkDocs.filter(d => d.exists).length;

      // 回覆：一般進度 or 全部完成
      if (completed < total) {
        return replyOrPush(event, client, { type: 'text', text: `✅ 今日進度 ${completed}/${total}，繼續加油唷～` });
      }

      // ====== 全部完成（當日最後一次）→ 嘗試給抽卡 ======
      // 1) 先送完成訊息
      const doneMsg = { type: 'text', text: `🎉 今日所有提醒簽到完成 ${completed}/${total}！` };

      // 2) 檢查 / 累加今日抽卡次數（上限 3 次）
      const { allowed, count } = await addDailyDrawIfAvailable(_db, userId, todayKey);

      if (allowed) {
        // 送抽卡卡片（帶連結）
        const drawCard = buildDrawFlex(DRAW_URL);
        return replyOrPush(event, client, [doneMsg, drawCard]);
      } else {
        // 已達上限：只送完成訊息 + 補一句話
        const msg = { type: 'text', text: '（今日抽卡次數已達上限）' };
        return replyOrPush(event, client, [doneMsg, msg]);
      }
    }

    return replyOrPush(event, client, { type: 'text', text: '⚠️ 未知的簽到類型。' });
  } catch (err) {
    console.error('[checkin] 錯誤：', err);
    return replyOrPush(event, client, { type: 'text', text: '⚠️ 無法完成簽到，請稍後再試。' });
  }
}

module.exports = { handleCheckin };

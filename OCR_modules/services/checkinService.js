// checkinService.js
const { db } = require('../../firebase');                  // 若路徑不同，請調整
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { replyOrPush } = require('./reminderService');
// 🔽 套用你的卡片樣式（若檔案不在同資料夾，請調整路徑）
const healthCardBase = require('./healthCard');

dayjs.extend(utc);
dayjs.extend(timezone);

// 抽卡頁連結（改成你的實際頁面）
const DRAW_URL = 'https://medwell-test1.web.app/gacha';

function parseQuery(q) {
  return Object.fromEntries(new URLSearchParams(q || ''));
}
function todayKeyTW() {
  return dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');
}
function weekdayIndexTW() {
  return dayjs().tz('Asia/Taipei').day();
}

// 以 transaction 累加「今日抽卡次數」，最多 3 次；回傳 { allowed, count }
async function addDailyDrawIfAvailable(_db, userId, dateKey) {
  const ref = _db.collection('dailyDraws').doc(`${userId}_${dateKey}`);
  return await _db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const curr = snap.exists ? (snap.data().count || 0) : 0;
    if (curr >= 3) return { allowed: false, count: curr };
    const next = curr + 1;
    tx.set(ref, { userId, dateKey, count: next, updatedAt: new Date() }, { merge: true });
    return { allowed: true, count: next };
  });
}

// 以 healthCard 樣式產生「抽卡」卡片：改標題/altText + 將按鈕改為 URI
function buildDrawFlexFromHealthCard(url) {
  const card = JSON.parse(JSON.stringify(healthCardBase));       // 深拷貝避免污染原模組
  // altText
  card.altText = '抽卡機會 +1';
  // 標題（header）
  try {
    if (card.contents?.header?.contents?.[0]?.type === 'text') {
      card.contents.header.contents[0].text = '🎴 抽卡機會 +1';
    }
  } catch (_) {}
  // 內文加上一句完成提示
  try {
    if (Array.isArray(card.contents?.body?.contents)) {
      card.contents.body.contents.unshift({
        type: 'text',
        text: '恭喜完成今日最後一次提醒！',
        size: 'sm',
        color: '#666',
        wrap: true
      });
    }
  } catch (_) {}
  // footer 第一顆按鈕改成 URI「立即抽卡」
  try {
    const btn = card.contents?.footer?.contents?.[0];
    if (btn && btn.type === 'button') {
      btn.action = { type: 'uri', label: '立即抽卡', uri: url };
      btn.style = 'primary';
      if (!btn.color) btn.color = '#659963';
    } else {
      // 若結構不同就補一顆
      if (!card.contents.footer) {
        card.contents.footer = { type: 'box', layout: 'vertical', contents: [] };
      }
      card.contents.footer.contents.push({
        type: 'button',
        style: 'primary',
        action: { type: 'uri', label: '立即抽卡', uri: url }
      });
    }
  } catch (_) {}
  return card;
}

async function handleCheckin(event, dbArg, client) {
  const _db = dbArg || db;

  const userId = event.source?.userId;
  const p = parseQuery(event.postback?.data || '');
  const type = p.type || 'single';           // 舊版相容
  const id = p.id || p.reminderId;           // 舊版相容

  if (!userId || !id) {
    return replyOrPush(event, client, { type: 'text', text: '⚠️ 發生錯誤，請稍後再試。' });
  }

  const todayKey = todayKeyTW();

  try {
    // ===== 單次：標記完成，不牽涉抽卡 =====
    if (type === 'single') {
      const docRef = _db.collection('time').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) return replyOrPush(event, client, { type: 'text', text: '這筆提醒可能已被刪除或已簽到。' });
      if (doc.data().done) return replyOrPush(event, client, { type: 'text', text: '這筆提醒已經簽到過了唷！' });
      await docRef.update({ done: true });
      return replyOrPush(event, client, { type: 'text', text: '✅ 已完成簽到' });
    }

    // ===== 重複：記錄今日簽到 + 最後一次時發抽卡（上限 3 次/日）
    if (type === 'repeat') {
      const wday = weekdayIndexTW();

      // 確認設定存在
      const repRef = _db.collection('repeatingReminders').doc(id);
      const repDoc = await repRef.get();
      if (!repDoc.exists) return replyOrPush(event, client, { type: 'text', text: '找不到這筆重複提醒設定。' });

      // 寫入當日簽到（去重）
      const chkRef = _db.collection('repeatCheckins').doc(`${id}_${todayKey}`);
      const chkDoc = await chkRef.get();
      if (!chkDoc.exists) {
        await chkRef.set({ userId, reminderId: id, dateKey: todayKey, createdAt: new Date() });
      }

      // 計算今日重複提醒總數 / 完成數
      const todayRepeatsSnap = await _db.collection('repeatingReminders')
        .where('userId', '==', userId)
        .where('active', '==', true)
        .where('weekdays', 'array-contains', wday)
        .get();
      const total = todayRepeatsSnap.size;
      const checkDocs = await Promise.all(
        todayRepeatsSnap.docs.map(r => _db.collection('repeatCheckins').doc(`${r.id}_${todayKey}`).get())
      );
      const completed = checkDocs.filter(d => d.exists).length;

      if (completed < total) {
        // 尚未全部完成：只回進度
        return replyOrPush(event, client, { type: 'text', text: `✅ 今日進度 ${completed}/${total}，繼續加油唷～` });
      }

      // 全部完成（當日最後一次）
      const doneMsg = { type: 'text', text: `🎉 今日所有提醒簽到完成 ${completed}/${total}！` };

      // 檢查/累加抽卡次數（每日上限 3）
      const { allowed } = await addDailyDrawIfAvailable(_db, userId, todayKey);
      if (allowed) {
        const drawCard = buildDrawFlexFromHealthCard(DRAW_URL);
        return replyOrPush(event, client, [doneMsg, drawCard]);
      } else {
        return replyOrPush(event, client, [doneMsg, { type: 'text', text: '（今日抽卡次數已達上限）' }]);
      }
    }

    return replyOrPush(event, client, { type: 'text', text: '⚠️ 未知的簽到類型。' });
  } catch (err) {
    console.error('[checkin] 錯誤：', err);
    return replyOrPush(event, client, { type: 'text', text: '⚠️ 無法完成簽到，請稍後再試。' });
  }
}

module.exports = { handleCheckin };

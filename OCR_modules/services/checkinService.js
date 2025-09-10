// checkinService.js
const { db } = require('../../firebase');                  // 若路徑不同，請調整
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { replyOrPush } = require('./reminderService');
// 🔽 套用你的卡片樣式（若檔案不在同資料夾，請調整路徑）
let healthCardBase = null;
try {
  healthCardBase = require('../flex/cardflex');
} catch (e) {
  console.warn('[checkin] cardflex not found, will use minimal flex. err=', e?.message);
}

dayjs.extend(utc);
dayjs.extend(timezone);;

// 抽卡頁連結（改成你的實際頁面）
const DRAW_URL = 'https://medwell-test1.web.app/newcard/index.html';

function parseQuery(q) {
  return Object.fromEntries(new URLSearchParams(q || ''));
}
function todayKeyTW() {
  return dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');
}
function weekdayIndexTW() {
  return dayjs().tz('Asia/Taipei').day();
}
async function safeReplyOrPush(event, client, primaryMsg, fallbackMsg) {
  try {
    return await replyOrPush(event, client, primaryMsg);
  } catch (err) {
    console.error('[checkin] send error:', err?.response?.data || err);
    try {
      return await replyOrPush(event, client, fallbackMsg);
    } catch (e2) {
      console.error('[checkin] fallback send error:', e2?.response?.data || e2);
    }
  }
}
// 最小合法 Flex（一定過）
function buildMinimalDrawFlex(url) {
  return {
    type: 'flex',
    altText: '抽卡機會 +1',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: '🎴 抽卡機會 +1', weight: 'bold', size: 'lg', color: '#333333' },
          { type: 'text', text: '恭喜完成今日最後一次提醒！', size: 'sm', color: '#666666', wrap: true }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', contents: [
          { type: 'button', style: 'primary',
            action: { type: 'uri', label: '立即抽卡', uri: DRAW_URL } }
        ]
      }
    }
  };
}
// 先 reply 完成文字，再 push 抽卡卡（若失敗退最小 Flex，最後退純文字連結）
async function replyThenPushDraw(event, client, userId, doneMsg, url) {
  // 1) 回覆完成文字
  try {
    if (event.replyToken) {
      await client.replyMessage(event.replyToken, doneMsg);
    } else {
      await client.pushMessage(userId, doneMsg);
    }
  } catch (e) {
    console.error('[checkin] reply done text error:', e?.response?.data || e);
  }

  // 2) push 抽卡卡片（你的 healthCard → 最小 Flex → 文字連結）
  try {
    const card = buildDrawFlexFromHealthCard(url); // 你已經有這個函式
    await client.pushMessage(userId, card);
  } catch (e1) {
    console.error('[checkin] push healthCard error:', e1?.response?.data || e1);
    try {
      await client.pushMessage(userId, buildMinimalDrawFlex(url));
    } catch (e2) {
      console.error('[checkin] push minimal flex error:', e2?.response?.data || e2);
      await client.pushMessage(userId, { type: 'text', text: `抽卡連結：${url}` });
    }
  }
}

// 先送 healthCard 版 → 失敗改用最小 Flex → 再失敗退純文字
async function sendDrawCardSafe(event, client, doneMsg, url) {
  try {
    const card = buildDrawFlexFromHealthCard(url);   // 你先前的函式
    return await replyOrPush(event, client, [doneMsg, card]);
  } catch (e1) {
    console.error('[checkin] send flex error(healthCard):', e1?.response?.data || e1);
    try {
      const minimal = buildMinimalDrawFlex(url);
      return await replyOrPush(event, client, [doneMsg, minimal]);
    } catch (e2) {
      console.error('[checkin] send flex error(minimal):', e2?.response?.data || e2);
      return replyOrPush(event, client, [doneMsg, { type: 'text', text: `抽卡連結：${url}` }]);
    }
  }
}

// 以 transaction 累加「今日抽卡次數」，最多 3 次；回傳 { allowed, count }
async function addDailyDrawIfAvailable(_db, userId, dateKey) {
  const id = `${userId}_${dateKey}`;
  const ref = _db.collection('dailyDraws').doc(id);
  return await _db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const curr = snap.exists ? (snap.data().count || 0) : 0;
    console.log('[draw] docId=', id, 'curr=', curr); // ← 看看現在是幾次
    if (curr >= 3) return { allowed: false, count: curr };
    const next = curr + 1;
    tx.set(ref, { userId, dateKey, count: next, updatedAt: new Date() }, { merge: true });
    console.log('[draw] increment ->', next);
    return { allowed: true, count: next };
  });
}


// 以 healthCard 樣式產生「抽卡」卡片：改標題/altText + 將按鈕改為 URI
// 以 healthCard 樣式產生「抽卡」卡片：支援 function / string / object，失敗退回最小 Flex
function buildDrawFlexFromHealthCard(url) {
  try {
    // 1) 取得基底卡：function → 呼叫、string → JSON.parse、object → 原樣
    let base = healthCardBase;
    if (typeof base === 'function') base = base();
    if (typeof base === 'string') base = JSON.parse(base);
    if (!base || typeof base !== 'object') throw new Error('healthCardBase is not an object');

    // 2) 深拷貝（Node 18+ 有 structuredClone）
    const card = (typeof structuredClone === 'function')
      ? structuredClone(base)
      : JSON.parse(JSON.stringify(base));

    // 3) 套文案與 altText
    card.altText = '抽卡機會 +1';

    // 有 header 的話改第一個文字；沒有就加在 body
    if (card?.contents?.header?.contents?.[0]?.type === 'text') {
      card.contents.header.contents[0].text = '🎴 抽卡機會 +1';
    } else if (Array.isArray(card?.contents?.body?.contents)) {
      card.contents.body.contents.unshift({
        type: 'text', text: '🎴 抽卡機會 +1', weight: 'bold', size: 'lg', color: '#333'
      });
    }

    // 在 body 補一句完成提示
    if (Array.isArray(card?.contents?.body?.contents)) {
      card.contents.body.contents.push({
        type: 'text', text: '恭喜完成今日最後一次提醒！', size: 'sm', color: '#666', wrap: true
      });
    }

    // 4) footer：找一顆按鈕改成 URI；沒有就補一顆
    if (!card?.contents?.footer) {
      card.contents.footer = { type: 'box', layout: 'vertical', contents: [] };
    }
    if (!Array.isArray(card.contents.footer.contents)) {
      card.contents.footer.contents = [];
    }
    const idx = card.contents.footer.contents.findIndex(c => c && c.type === 'button');
    const uriBtn = {
      type: 'button', style: 'primary',
      action: { type: 'uri', label: '立即抽卡', uri: url },
      color: '#659963'
    };
    if (idx >= 0) card.contents.footer.contents[idx] = uriBtn;
    else card.contents.footer.contents.push(uriBtn);

    return card;
  } catch (e) {
    console.error('[checkin] buildDrawFlexFromHealthCard error:', e);
    // 失敗 → 最小合法 Flex（保證不 400）
    return {
      type: 'flex',
      altText: '抽卡機會 +1',
      contents: {
        type: 'bubble',
        body: {
          type: 'box', layout: 'vertical', spacing: 'md',
          contents: [
            { type: 'text', text: '🎴 抽卡機會 +1', weight: 'bold', size: 'lg', color: '#333' },
            { type: 'text', text: '恭喜完成今日最後一次提醒！', size: 'sm', color: '#666', wrap: true }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical',
          contents: [
            { type: 'button', style: 'primary',
              action: { type: 'uri', label: '立即抽卡', uri: url }, color: '#659963' }
          ]
        }
      }
    };
  }
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
      // 全部完成（當日最後一次）
const doneMsg = { type: 'text', text: `🎉 今日所有提醒簽到完成 ${completed}/${total}！` };

// 檢查/累加抽卡次數（每日上限 3）
const { allowed } = await addDailyDrawIfAvailable(_db, userId, todayKey);

if (allowed) {
  // ✅ 改為：先回覆完成文字，再 push 抽卡卡片（分兩次送，最穩）
  await replyThenPushDraw(event, client, userId, doneMsg, DRAW_URL);
  return; // 已處理完
} else {
  // 已達上限就純文字
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

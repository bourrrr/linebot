// reminderService.js
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const { Timestamp } = require('firebase-admin/firestore');

// 暫存使用者「正在設定」的提醒，只存時間（不再存藥名）
const reminderCache = {}; // { [userId]: { datetime: dayjs(...) } }

function formatTW(dt) {
  return dayjs.tz(dt, 'Asia/Taipei').format('YYYY/MM/DD HH:mm');
}

/**
 * 用藥提醒 Postback 流程（已移除藥名）：
 * - action=select_time   (LINE datetime picker 回傳)
 * - action=confirm_reminder
 */
async function handleReminderPostback(event, db, client) {
  if (event.type !== 'postback') return false;

  const userId = event.source?.userId;
  const data = event.postback?.data || '';
  const params = event.postback?.params || {};

  // 1) 選時間（從 datetime picker 回傳）
  if (data.startsWith('action=select_time')) {
    const dtStr = params.datetime; // e.g. "2025-08-14T08:00"
    if (!dtStr) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '請先從日期時間選擇器選擇時間喔。'
      });
      return true;
    }

    const dtTW = dayjs.tz(dtStr, 'Asia/Taipei');
    reminderCache[userId] = { datetime: dtTW };

    // 給一個「確認提醒」按鈕
    await client.replyMessage(event.replyToken, {
      type: 'template',
      altText: '確認提醒',
      template: {
        type: 'buttons',
        title: '確認提醒',
        text: `已選時間：${formatTW(dtTW)}（台北時間）\n請按下方「確認提醒」建立。`,
        actions: [
          {
            type: 'postback',
            label: '✅ 確認提醒',
            data: 'action=confirm_reminder'
          }
        ]
      }
    });
    return true;
  }

  // 2) 確認提醒（只檢查時間，不再檢查藥名）
  if (data === 'action=confirm_reminder') {
    const cache = reminderCache[userId];
    if (!cache || !cache.datetime) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '⚠️ 尚未選擇時間，請先用時間選擇器選擇時間。'
      });
      return true;
    }

    const nowTW = dayjs.tz(new Date(), 'Asia/Taipei');
    const dtTW = cache.datetime;
    if (dtTW.isBefore(nowTW)) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `⚠️ 時間不可早於現在。\n你選的是：${formatTW(dtTW)}`
      });
      return true;
    }

    // 產出今天的 dateKey 與 slot（當日第幾筆）
    const dateKey = dtTW.format('YYYY-MM-DD');
    const timeRef = db.collection('time');

    const existingTodaySnap = await timeRef
      .where('userId', '==', userId)
      .where('dateKey', '==', dateKey)
      .get();

    const slot = existingTodaySnap.size; // 0,1,2,...

    // 建立 /time（medicine 以空字串/預設值存）
    await timeRef.add({
      userId,
      datetime: Timestamp.fromDate(dtTW.toDate()),
      done: false,
      medicine: "",              // ← 已移除藥名需求，存空字串或 "每日用藥"
      dateKey,                   // e.g. "2025-08-14"
      slot                       // 當日第幾個時段
    });

    // 清掉 cache
    delete reminderCache[userId];

    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ 已設定提醒：${formatTW(dtTW)}（台北時間）`
    });
    return true;
  }

  return false;
}

module.exports = {
  reminderCache,
  handleReminderPostback,
};

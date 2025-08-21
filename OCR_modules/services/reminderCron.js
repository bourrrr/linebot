// reminderCron.js
const cron = require('node-cron');
const admin = require('firebase-admin');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

// 工具：當前台灣時間對齊到分鐘（去掉秒）
function nowTWMinute() {
  return dayjs().tz('Asia/Taipei').startOf('minute');
}

function weekdayIndexTW(djs) {
  // 0=Sunday...6=Saturday（與 LINE 顯示一致）
  return djs.day();
}

/**
 * 每分鐘執行一次，同步處理：
 * 1) 單次提醒（time）
 * 2) 重複提醒（repeatingReminders）
 */
function startReminderCron(db, client) {
  cron.schedule('* * * * *', async () => {
    const now = nowTWMinute();                       // e.g. 2025-08-21 12:34:00+08:00
    const tsNow = admin.firestore.Timestamp.fromDate(now.toDate());
    const wday = weekdayIndexTW(now);               // 當日星期索引（0–6）
    const hh = now.hour();
    const mm = now.minute();

    console.log('[cron] TW now:', now.format('YYYY-MM-DD HH:mm:ss Z'), 'weekday=', wday, 'hh:mm=', hh, mm);

    // ============= 單次提醒（time）=============
    try {
      const singleSnap = await db.collection('time')
        .where('done', '==', false)
        .where('datetime', '==', tsNow) // 精確匹配當前分鐘
        .get();

      console.log(`[cron] singles due: ${singleSnap.size}`);

      for (const doc of singleSnap.docs) {
        const d = doc.data();
        const userId = d.userId;
        if (!userId) continue;

        const text = d.medicine ? `請記得服用藥物：${d.medicine}` : '⏰ 到時間囉，請記得用藥！';

        try {
          await client.pushMessage(userId, {
            type: 'template',
            altText: '用藥提醒',
            template: {
              type: 'buttons',
              title: '💊 用藥提醒',
              text,
              actions: [
                {
                  type: 'postback',
                  label: '✅ 確認',
                  data: `action=checkin&type=single&id=${doc.id}`
                }
              ]
            }
          });
          console.log('[cron] ✅ pushed single to', userId, 'id:', doc.id);
        } catch (err) {
          console.error('[cron] ❌ push single error:', err);
        }
      }
    } catch (err) {
      console.error('[cron] ❌ query singles error:', err);
    }

    // ============= 重複提醒（repeatingReminders）=============
    try {
  const wdayNum = wday;              // 0..6 (number)
  const hhNum = hh;                  // number
  const mmNum = mm;                  // number

  // 先用「數字」型別查
  let repeatSnap = await db.collection('repeatingReminders')
    .where('active', '==', true)
    .where('weekdays', 'array-contains', wdayNum)
    .where('hour', '==', hhNum)
    .where('minute', '==', mmNum)
    .get();

  // 若查不到，改用「字串」型別再查一次（兼容舊資料）
  if (repeatSnap.size === 0) {
    console.log('[cron] repeats fallback to string type query');
    repeatSnap = await db.collection('repeatingReminders')
      .where('active', '==', true)
      .where('weekdays', 'array-contains', String(wdayNum))
      .where('hour', '==', String(hhNum))
      .where('minute', '==', String(mmNum))
      .get();
  }

  console.log(`[cron] repeats due: ${repeatSnap.size} (wday=${wdayNum}, hh=${hhNum}, mm=${mmNum})`);

  // 附帶：若你想再確認一下資料型別，印出前 1 筆
  if (repeatSnap.size > 0) {
    const d0 = repeatSnap.docs[0].data();
    console.log('[cron] sample repeat doc:', {
      id: repeatSnap.docs[0].id,
      userId: d0.userId,
      weekdays: d0.weekdays,
      hour: d0.hour, minute: d0.minute, active: d0.active,
      types: {
        weekdays0: Array.isArray(d0.weekdays) ? typeof d0.weekdays[0] : null,
        hour: typeof d0.hour, minute: typeof d0.minute
      }
    });
  }

  for (const doc of repeatSnap.docs) {
    const d = doc.data();
    const userId = d.userId;
    if (!userId) continue;

    const text = '⏰ 到時間囉，請記得用藥！（重複提醒）';
    try {
      await client.pushMessage(userId, {
        type: 'template',
        altText: '用藥提醒',
        template: {
          type: 'buttons',
          title: '💊 用藥提醒',
          text,
          actions: [
            {
              type: 'postback',
              label: '✅ 簽到',
              data: `action=checkin&type=repeat&id=${doc.id}`
            }
          ]
        }
      });
      console.log('[cron] ✅ pushed repeat to', userId, 'id:', doc.id);
    } catch (err) {
      console.error('[cron] ❌ push repeat error:', err);
    }
  }
} catch (err) {
  console.error('[cron] ❌ query repeats error:', err);
}
  });
}

module.exports = { startReminderCron };

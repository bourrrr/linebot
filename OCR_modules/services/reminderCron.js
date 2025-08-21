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
                  label: '✅ 簽到',
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
      const repeatSnap = await db.collection('repeatingReminders')
        .where('active', '==', true)
        .where('weekdays', 'array-contains', wday)
        .where('hour', '==', hh)
        .where('minute', '==', mm)
        .get();

      console.log(`[cron] repeats due: ${repeatSnap.size}`);

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

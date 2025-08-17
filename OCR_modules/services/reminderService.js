// reminderService.js
const admin = require('firebase-admin');
const { Timestamp } = admin.firestore;
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const reminderCache = {}; // 暫存使用者選的時間
const MAX_BUBBLES = 12;   // LINE Flex carousel 上限

/* ---------------- Utils ---------------- */
function parseQuery(q) {
  return (q || '').split('&').reduce((acc, kv) => {
    const [k, v] = kv.split('=');
    if (k) acc[k] = decodeURIComponent(v || '');
    return acc;
  }, {});
}
function fmtDate(ts) {
  try { return dayjs.tz(ts.toDate(), 'Asia/Taipei').format('YYYY/MM/DD'); } catch { return ''; }
}
function fmtTime(ts) {
  try { return dayjs.tz(ts.toDate(), 'Asia/Taipei').format('HH:mm'); } catch { return ''; }
}
function weekdayFromDateKey(dateKey) {
  const d = dayjs.tz(dateKey, 'Asia/Taipei');
  const map = ['週日','週一','週二','週三','週四','週五','週六'];
  return map[d.day()];
}
function fmtWeekdaysFromArray(arr = []) {
  const map = ['週日','週一','週二','週三','週四','週五','週六'];
  return arr.sort().map(i => map[i] ?? '').filter(Boolean).join('、');
}
function formatTW(d) { return d.tz('Asia/Taipei').format('YYYY/MM/DD HH:mm'); }

/**
 * 安全回覆：先 reply，失敗或無 token 再 push
 * - 支援一次傳多則訊息（陣列）
 * - 其他 service（如 checkin）可直接引用此函式，避免 400
 */
async function replyOrPush(event, client, message) {
  const messages = Array.isArray(message) ? message : [message];
  const userId = event?.source?.userId;

  if (event?.replyToken) {
    try {
      return await client.replyMessage(event.replyToken, messages.length === 1 ? messages[0] : messages);
    } catch (e) {
      console.error('LINE reply error:', e.response?.data || e.message);
      if (userId) {
        return client.pushMessage(userId, messages.length === 1 ? messages[0] : messages);
      }
      throw e;
    }
  }
  if (userId) {
    return client.pushMessage(userId, messages.length === 1 ? messages[0] : messages);
  }
  throw new Error('No replyToken and no userId.');
}

/* ---------------- Step 1: Reminder Carousel ---------------- */
async function sendReminderCarousel(event, db, client) {
  const userId = event.source?.userId;
  if (!userId) return replyOrPush(event, client, { type:'text', text:'⚠️ 無法取得使用者' });

  const now = dayjs.tz(new Date(), 'Asia/Taipei');
  const next3 = now.add(3, 'day');

  // 單次提醒（time）：今天 ~ +3 天
  const timeSnap = await db.collection('time')
    .where('userId','==', userId)
    .where('datetime','>=', Timestamp.fromDate(now.startOf('day').toDate()))
    .where('datetime','<=', Timestamp.fromDate(next3.endOf('day').toDate()))
    .orderBy('datetime','asc')
    .get();

  // 重複提醒（repeatingReminders）
  const repSnap = await db.collection('repeatingReminders')
    .where('userId','==', userId)
    .where('active','==', true)
    .get();

  const bubbles = [];

  // 單次 time
  for (const doc of timeSnap.docs) {
    const d = doc.data();
    const dayStr = fmtDate(d.datetime);
    const timeStr = fmtTime(d.datetime);
    const weekdayStr = d.dateKey ? weekdayFromDateKey(d.dateKey) : '';

    bubbles.push({
      type:'bubble',
      body:{
        type:'box', layout:'vertical', spacing:'sm',
        contents:[
          { type:'text', text:'🔔 單次提醒', weight:'bold', size:'md', color:'#333' },
          { type:'text', text:`時間：${timeStr}`, size:'sm' },
          { type:'text', text:`設定日期：${dayStr}`, size:'sm' },
          { type:'text', text:`設定星期：${weekdayStr}`, size:'sm' },
        ]
      },
      footer:{
        type:'box', layout:'vertical',
        contents:[
          {
            type:'button', style:'secondary',
            action:{
              type:'postback', label:'❌ 取消提醒',
              data:`action=prepare_delete&kind=time&reminderId=${doc.id}&targetDate=${d.dateKey || ''}`
            }
          }
        ]
      }
    });
  }

  // 重複 repeating
  for (const doc of repSnap.docs) {
    const d = doc.data();
    const hh = String(d.hour ?? '').padStart(2,'0');
    const mm = String(d.minute ?? '').padStart(2,'0');
    const weekdayStr = fmtWeekdaysFromArray(d.weekdays || d.weekDays || []);

    bubbles.push({
      type:'bubble',
      body:{
        type:'box', layout:'vertical', spacing:'sm',
        contents:[
          { type:'text', text:'🔁 重複提醒', weight:'bold', size:'md', color:'#333' },
          { type:'text', text:`時間：${hh}:${mm}`, size:'sm' },
          { type:'text', text:`設定日期：—`, size:'sm' },
          { type:'text', text:`設定星期：${weekdayStr || '未設定'}`, size:'sm' },
        ]
      },
      footer:{
        type:'box', layout:'vertical',
        contents:[
          {
            type:'button', style:'secondary',
            action:{
              type:'postback', label:'❌ 取消提醒',
              data:`action=prepare_delete&kind=repeating&reminderId=${doc.id}`
            }
          }
        ]
      }
    });
  }

  if (!bubbles.length) {
    bubbles.push({
      type:'bubble',
      body:{ type:'box', layout:'vertical', contents:[ { type:'text', text:'目前沒有任何提醒', size:'sm', color:'#666' } ] }
    });
  }

  // Flex carousel 最多 12 張，避免 400
  const contents = bubbles.slice(0, MAX_BUBBLES);

  return replyOrPush(event, client, {
    type:'flex',
    altText:'提醒清單',
    contents:{ type:'carousel', contents }
  });
}

/* ---------------- Step 2: 刪除條件 Flex ---------------- */
async function handlePrepareDelete(event, db, client) {
  const p = parseQuery(event.postback?.data || '');
  const { kind, reminderId, targetDate = '' } = p;

  const btns = [];
  if (kind === 'time') {
    btns.push({
      type:'button', style:'primary',
      action:{ type:'postback', label:'✅ 僅取消某日', data:`action=confirm_delete&type=time&reminderId=${reminderId}&targetDate=${encodeURIComponent(targetDate)}` }
    });
  } else if (kind === 'repeating') {
    btns.push({
      type:'button', style:'primary',
      action:{ type:'postback', label:'📆 僅取消某日', data:`action=confirm_delete&type=time_from_repeating&reminderId=${reminderId}&targetDate=${encodeURIComponent(targetDate)}` }
    });
    btns.push({
      type:'button', style:'secondary',
      action:{ type:'postback', label:'🗓️ 取消整個重複提醒', data:`action=confirm_delete&type=repeating&reminderId=${reminderId}` }
    });
  }

  return replyOrPush(event, client, {
    type:'flex',
    altText:'選擇刪除條件',
    contents:{
      type:'bubble',
      body:{
        type:'box', layout:'vertical', spacing:'md',
        contents:[
          { type:'text', text:'刪除設定', weight:'bold', size:'md' },
          { type:'text', text:'請選擇刪除範圍：', size:'sm', color:'#666' }
        ]
      },
      footer:{ type:'box', layout:'vertical', spacing:'sm', contents:btns }
    }
  });
}

/* ---------------- Step 3: 確認刪除 ---------------- */
async function handleConfirmDelete(event, db, client) {
  const userId = event.source?.userId;
  const p = parseQuery(event.postback?.data || '');
  const { type, reminderId, targetDate = '' } = p;

  if (!userId || !type || !reminderId) {
    return replyOrPush(event, client, { type:'text', text:'⚠️ 缺少確認刪除參數' });
  }

  if (type === 'time') {
    await db.collection('time').doc(reminderId).delete();
    return replyOrPush(event, client, { type:'text', text:'✅ 已取消該日提醒' });
  }

  if (type === 'time_from_repeating') {
    const repRef = db.collection('repeatingReminders').doc(reminderId);
    const repDoc = await repRef.get();
    if (!repDoc.exists) return replyOrPush(event, client, { type:'text', text:'⚠️ 找不到重複提醒' });
    const rep = repDoc.data();
    const date = targetDate || dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');

    const begin = dayjs.tz(`${date} 00:00`, 'Asia/Taipei');
    const end = dayjs.tz(`${date} 23:59:59`, 'Asia/Taipei');

    const daySnap = await db.collection('time')
      .where('userId','==', userId)
      .where('datetime','>=', Timestamp.fromDate(begin.toDate()))
      .where('datetime','<=', Timestamp.fromDate(end.toDate()))
      .get();

    const batch = db.batch();
    for (const d of daySnap.docs) {
      const row = d.data();
      if (!row.datetime) continue;
      const h = dayjs.tz(row.datetime.toDate(), 'Asia/Taipei').hour();
      const m = dayjs.tz(row.datetime.toDate(), 'Asia/Taipei').minute();
      if (h === rep.hour && m === rep.minute) batch.delete(d.ref);
    }
    await batch.commit();
    return replyOrPush(event, client, { type:'text', text:`✅ 已取消 ${date} 的那筆提醒` });
  }

  if (type === 'repeating') {
    const repRef = db.collection('repeatingReminders').doc(reminderId);
    const repDoc = await repRef.get();
    if (!repDoc.exists) return replyOrPush(event, client, { type:'text', text:'⚠️ 找不到重複提醒' });

    const rep = repDoc.data();
    await repRef.update({ active:false });

    const now = dayjs.tz(new Date(), 'Asia/Taipei');
    const futureSnap = await db.collection('time')
      .where('userId','==', userId)
      .where('datetime','>=', Timestamp.fromDate(now.startOf('day').toDate()))
      .get();

    const batch = db.batch();
    for (const d of futureSnap.docs) {
      const row = d.data();
      if (!row.datetime) continue;
      const h = dayjs.tz(row.datetime.toDate(), 'Asia/Taipei').hour();
      const m = dayjs.tz(row.datetime.toDate(), 'Asia/Taipei').minute();
      if (h === rep.hour && m === rep.minute) batch.delete(d.ref);
    }
    await batch.commit();

    return replyOrPush(event, client, { type:'text', text:'🗓️ 已取消整個重複提醒' });
  }

  return replyOrPush(event, client, { type:'text', text:'⚠️ 未支援的刪除類型' });
}

/* ---------------- 建立單次提醒流程 ---------------- */
async function replyTimePicker(event, client) {
  // LINE datetimepicker 用於 select_time
  return replyOrPush(event, client, {
    type: 'template',
    altText: '選擇提醒時間',
    template: {
      type: 'buttons',
      title: '選擇提醒時間',
      text: '請從下方選擇日期與時間',
      actions: [
        {
          type: 'datetimepicker',
          label: '選擇日期時間',
          data: 'action=select_time', // 之後回到 select_time
          mode: 'datetime'
        }
      ]
    }
  });
}

async function handleSelectTime(event, client) {
  const userId = event.source?.userId;
  const dtStr = event.postback?.params?.datetime; // "2025-08-21T08:00"
  if (!userId || !dtStr) {
    return replyOrPush(event, client, { type:'text', text:'⚠️ 未取得時間，請重新選擇' });
  }
  const dtTW = dayjs.tz(dtStr, 'Asia/Taipei');
  reminderCache[userId] = { datetime: dtTW };

  return replyOrPush(event, client, {
    type: 'template',
    altText: '確認提醒',
    template: {
      type: 'confirm',
      text: `已選時間：\n${formatTW(dtTW)}\n是否建立提醒？`,
      actions: [
        { type:'postback', label:'✅ 確認', data:'action=confirm_reminder' },
        { type:'postback', label:'取消', data:'action=cancel_reminder' }
      ]
    }
  });
}

async function handleConfirmReminder(event, db, client) {
  const userId = event.source?.userId;
  const cache = reminderCache[userId];
  if (!userId || !cache?.datetime) {
    return replyOrPush(event, client, { type:'text', text:'⚠️ 尚未選擇時間' });
  }

  const dtTW = cache.datetime;
  const nowTW = dayjs.tz(new Date(), 'Asia/Taipei');
  if (dtTW.isBefore(nowTW)) {
    return replyOrPush(event, client, { type:'text', text:`⚠️ 時間不可早於現在。\n你選的是：${formatTW(dtTW)}` });
  }

  const dateKey = dtTW.format('YYYY-MM-DD');
  const timeRef = db.collection('time');

  const existingTodaySnap = await timeRef
    .where('userId','==', userId)
    .where('dateKey','==', dateKey)
    .get();
  const slot = existingTodaySnap.size;

  await timeRef.add({
    userId,
    datetime: Timestamp.fromDate(dtTW.toDate()),
    dateKey,
    hour: dtTW.hour(),
    minute: dtTW.minute(),
    repeat: 'single',
    active: true,
    done: false,
    createdAt: Timestamp.now(),
    slot
  });

  delete reminderCache[userId];
  return replyOrPush(event, client, { type:'text', text:`✅ 已設定提醒：${formatTW(dtTW)}（台北時間）` });
}

/* ---------------- Postback Router ---------------- */
async function handleReminderPostback(event, db, client) {
  if (event.type !== 'postback') return false;
  const data = event.postback?.data || '';

  if (data === 'action=open_time_picker')      { await replyTimePicker(event, client); return true; }
  if (data === 'action=select_time')           { await handleSelectTime(event, client); return true; }
  if (data === 'action=confirm_reminder')      { await handleConfirmReminder(event, db, client); return true; }
  if (data === 'action=list_reminders')        { await sendReminderCarousel(event, db, client); return true; }
  if (data.startsWith('action=prepare_delete')){ await handlePrepareDelete(event, db, client); return true; }
  if (data.startsWith('action=confirm_delete')){ await handleConfirmDelete(event, db, client); return true; }

  // 忽略 cancel / 其他
  if (data === 'action=cancel_reminder')       { await replyOrPush(event, client, { type:'text', text:'已取消設定。' }); return true; }

  return false;
}

module.exports = {
  handleReminderPostback,
  sendReminderCarousel,
  replyOrPush, // ← 導出給 checkinService.js / 其他模組共用
};

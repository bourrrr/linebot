// OCR_modules/services/reminderService.js
const admin = require('firebase-admin');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const weekdayNames = ['日','一','二','三','四','五','六'];
function pad2(n){ return String(n).padStart(2,'0'); }
function parseQuery(q){ return Object.fromEntries(new URLSearchParams(q || '')); }

// 全域暫存
const reminderCache = (global.reminderCache ||= {});

// ========= 共用小工具 =========

// 膠囊按鈕（可指定底色與文字顏色）
function pill(label, data, bg, textColor = '#363636') {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: bg,
    cornerRadius: 'xl',
    paddingAll: '18px',
    action: { type: 'postback', label, data },
    contents: [
      { type: 'text', text: label, align: 'center', weight: 'bold', color: textColor }
    ]
  };
}

// 星期切換小按鈕（secondary 風格）
// 星期切換：奶黃膠囊鈕
function btnDay(d, label){
  return pill(label, `action=toggle_weekday&day=${d}`, '#efede9', '#363636');
}


// Reply or Push
async function replyOrPush(event, client, message) {
  if (event.replyToken) return client.replyMessage(event.replyToken, message);
  const userId = event?.source?.userId;
  if (!userId) throw new Error('replyOrPush: no replyToken or userId');
  return client.pushMessage(userId, message);
}

// ========= 主選單（已改成膠囊鈕配色） =========
function buildTimeMenuFlex() {
  return {
    type: "flex",
    altText: "用藥提醒操作",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "💊 用藥提醒設定", weight: "bold", size: "lg", color: "#333333" },
          { type: "text", text: "請選擇提醒類型：", size: "sm", color: "#666666", wrap: true }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "14px",
        contents: [
          pill('📅 單次提醒', 'action=create_single_reminder', '#659963', '#ffffff'),
          pill('🔄 重複提醒', 'action=create_repeating_reminder', '#efede9', '#363636'),
          pill('📋 查看我的提醒', 'action=list_reminders', '#659963', '#ffffff')
        ]
      }
    }
  };
}

// ========= 單次提醒：時間選擇 → 確認 → 寫入 =========
async function replyTimePicker(event, client) {
  return replyOrPush(event, client, {
    type: 'template',
    altText: '選擇提醒時間',
    template: {
      type: 'buttons',
      title: '⏰ 單次提醒',
      text: [
		  '請選擇提醒的時間',
		  '• 單次提醒不會累積抽卡機會',
		  '• 設定後可在「提醒清單」查看/刪除'
		].join('\n'),
      
      actions: [
        { type: 'datetimepicker', label: '選擇時間', data: 'action=select_time', mode: 'datetime' }
      ]
    }
  });
}

async function handleSelectTime(event, client) {
  const timeStr = event.postback?.params?.datetime; // e.g. 2025-08-19T19:40
  const userId = event.source?.userId;
  if (!timeStr || !userId) {
    return replyOrPush(event, client, { type:'text', text:'⚠️ 時間選擇錯誤，請重新選擇' });
  }
  reminderCache[userId] = { datetime: timeStr, type: 'single' };

  return replyOrPush(event, client, {
    type: 'template',
    altText: '確認提醒',
    template: {
      type: 'confirm',
      text: `⏰ 你選擇的提醒時間是：${timeStr}\n要儲存這個提醒嗎？`,
      actions: [
        { type: 'postback', label: '✅ 確認', data: 'action=confirm_reminder' },
        { type: 'postback', label: '❌ 取消', data: 'action=cancel_reminder' }
      ]
    }
  });
}

async function handleConfirmReminder(event, db, client) {
  const userId = event.source?.userId;
  const cache = reminderCache[userId];
  if (!userId || !cache?.datetime) {
    return replyOrPush(event, client, { type:'text', text:'⚠️ 無有效時間資訊，請重新設定提醒' });
  }
  const dt = new Date(cache.datetime);
  await db.collection('time').add({
    userId,
    datetime: dt,
    done: false,
    createdAt: new Date()
  });
  delete reminderCache[userId];

  return replyOrPush(event, client, {
    type: 'text',
    text: `✅ 已建立提醒：${dayjs(dt).tz('Asia/Taipei').format('YYYY/MM/DD HH:mm')}`
  });
}

// ========= 重複提醒：選時間 → 選星期 → 確認 =========
async function replyRepeatingTimeSetup(event, client) {
  // 建立一個包含文字訊息和按鈕模板的陣列
  const messages = [
    {
      // 文字訊息
      type: 'text',
      text: [
        '• 可累積抽卡機會，每日最高可累積 3 次抽卡機會',
        '• 當日最後簽到 → 自動發送抽卡按鈕',
        '• 設定後可在「提醒清單」查看/刪除'
      ].join('\n')
    },
    {
      // 按鈕模板
      type: 'template',
      altText: '設定重複提醒時間',
      template: {
        type: 'buttons',
        title: '⏰ 設定重複提醒',
        text: '請選擇提醒的時間', // 簡化的文字
        actions: [
          { type: 'datetimepicker', label: '選擇時間', data: 'action=select_repeating_time', mode: 'time' }
        ]
      }
    }
  ];

  // 使用 replyMessage 一次性傳送訊息陣列
  // 這會確保兩個訊息都在同一個回覆中被傳送
  return client.replyMessage(event.replyToken, messages);
}

async function handleSelectRepeatingTime(event, client) {
  const userId = event.source?.userId;
  const timeStr = event.postback?.params?.time; // "HH:mm"
  if (!userId || !timeStr) {
    return replyOrPush(event, client, { type:'text', text:'⚠️ 未取得時間，請重新選擇' });
  }
  const [hour, minute] = timeStr.split(':').map(Number);
  reminderCache[userId] = { hour, minute, type:'repeating' };

  return replyOrPush(event, client, {
    type: 'flex', altText: '選擇重複的星期',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
		   contents: [
	  { type:'text', text:'📅 選擇重複的星期', weight:'bold', size:'md' },
	  { type:'text', text:`提醒時間：${timeStr}`, size:'sm', color:'#666666' },
	  { type:'text', text:'請選擇要在哪些天重複提醒：', size:'sm', wrap:true },
	  { type:'text', text:'💡 點選一下即選取，再次點選即可取消', size:'xs', color:'#999999', wrap:true }
	]
      },
	  
    // 取代 handleSelectRepeatingTime 裡 replyOrPush(...) 的 footer 整段
footer: {
  type: 'box',
  layout: 'vertical',   // ✅ 垂直，底下兩排
  spacing: 'xs',
  contents: [
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'xs',
      contents: [
        btnDay(0, '日'), btnDay(1, '一'), btnDay(2, '二'), btnDay(3, '三')
      ]
    },
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'xs',
      contents: [
        btnDay(4, '四'), btnDay(5, '五'), btnDay(6, '六'),
        // 完成：綠色膠囊鈕（白字）
        Object.assign(
          {},
          pill('完成', 'action=confirm_repeating_reminder', '#659963', '#ffffff'),
          { flex: 1 }
        )
      ]
    }
  ]
}

    }
  });
}

async function handleToggleWeekday(event, client) {
  const userId = event.source?.userId;
  const params = parseQuery(event.postback?.data || '');
  const day = parseInt(params.day);
  if (!userId || Number.isNaN(day)) {
    return replyOrPush(event, client, { type:'text', text:'⚠️ 選擇錯誤，請重試' });
  }
  const cache = reminderCache[userId];
  if (!cache) return replyOrPush(event, client, { type:'text', text:'⚠️ 請重新設定提醒' });

  if (!cache.weekdays) cache.weekdays = [];
  const idx = cache.weekdays.indexOf(day);
  if (idx >= 0) cache.weekdays.splice(idx,1); else cache.weekdays.push(day);

  const selectedDays = cache.weekdays.sort().map(d => weekdayNames[d]).join('、');
  return replyOrPush(event, client, {
    type:'text',
    text:`已選擇：星期${selectedDays || '(無)'}\n\n請繼續選擇或按「完成」確認設定。`
  });
}

async function handleConfirmRepeatingReminder(event, db, client) {
  const userId = event.source?.userId;
  const cache = reminderCache[userId];
  if (!userId || !cache || !cache.weekdays || cache.weekdays.length === 0) {
    return replyOrPush(event, client, { type:'text', text:'⚠️ 請至少選擇一個星期' });
  }
  await db.collection('repeatingReminders').add({
    userId,
    hour: cache.hour,
    minute: cache.minute,
    weekdays: cache.weekdays,
    active: true,
    createdAt: admin.firestore.Timestamp.now()
  });
  delete reminderCache[userId];

  const timeStr = `${pad2(cache.hour)}:${pad2(cache.minute)}`;
  const days = cache.weekdays.sort().map(d => weekdayNames[d]).join('、');
  return replyOrPush(event, client, {
    type:'text',
    text:`✅ 已設定重複提醒！\n⏰ 時間：${timeStr}\n📅 重複：每週${days}`
  });
}

// ========= 清單（含刪除） =========
async function sendReminderCarousel(event, db, client) {
  const userId = event.source?.userId;
  if (!userId) return replyOrPush(event, client, { type:'text', text:'⚠️ 取得 userId 失敗' });

  const now = dayjs().tz('Asia/Taipei').toDate();

  const singleSnap = await db.collection('time')
    .where('userId','==',userId)
    .where('done','==',false)
    .where('datetime','>=',now)
    .orderBy('datetime','asc')
    .limit(10).get();

  const repeatSnap = await db.collection('repeatingReminders')
    .where('userId','==',userId)
    .where('active','==',true)
    .limit(10).get();

  const bubbles = [];

  // 單次
  for (const doc of singleSnap.docs) {
    const d = doc.data();
    const dt = d.datetime?.toDate ? d.datetime.toDate() : d.datetime;
    const timeStr = dayjs(dt).tz('Asia/Taipei').format('YYYY/MM/DD HH:mm');

    const bodyContents = [
      { type:'text', text:'📅 單次提醒', weight:'bold', size:'lg', color:'#588157' },
      { type:'text', text:`時間：${timeStr}`, size:'sm', color:'#666666' }
    ];
    if (d.medicine) {
      bodyContents.push({ type:'text', text:`藥名：${String(d.medicine).slice(0,60)}`, size:'sm', color:'#666666', wrap:true });
    }

    bubbles.push({
      type:'bubble',
      body:{ type:'box', layout:'vertical', spacing:'sm', contents: bodyContents },
      footer:{
        type:'box', layout:'vertical', spacing:'sm',
        contents:[ pill('🗑 刪除', `action=prepare_delete&type=time&id=${doc.id}`, '#efede9', '#363636') ]
      }
    });
  }

  // 重複
  for (const doc of repeatSnap.docs) {
    const d = doc.data();
    const timeStr = `${pad2(d.hour)}:${pad2(d.minute)}`;
    const days = Array.isArray(d.weekdays) ? d.weekdays.sort().map(i=>weekdayNames[i]).join('、') : '(未設定)';

    bubbles.push({
      type:'bubble',
      body:{ type:'box', layout:'vertical', spacing:'sm', contents:[
        { type:'text', text:'🔄 重複提醒', weight:'bold', size:'lg', color:'#588157' },
        { type:'text', text:`時間：${timeStr}`, size:'sm', color:'#666666' },
        { type:'text', text:`重複：每週 ${days}`, size:'sm', color:'#666666', wrap:true }
      ]},
      footer:{
        type:'box', layout:'vertical', spacing:'sm',
        contents:[ pill('🗑 刪除', `action=prepare_delete&type=repeat&id=${doc.id}`, '#efede9', '#363636') ]
      }
    });
  }

  if (bubbles.length === 0) {
    return replyOrPush(event, client, { type:'text', text:'目前沒有即將到來的提醒或重複提醒。' });
  }

  const message = {
    type:'flex',
    altText:'提醒清單',
    contents:{ type:'carousel', contents: bubbles.slice(0,12) }
  };

  try { console.log('[list_reminders] payload =', JSON.stringify(message)); } catch (_) {}
  return replyOrPush(event, client, message);
}

async function handlePrepareDelete(event, db, client) {
  const p = parseQuery(event.postback?.data);
  const { type, id } = p;
  if (!type || !id) {
    return replyOrPush(event, client, { type:'text', text:'⚠️ 刪除參數缺失' });
  }
  const label = type === 'repeat' ? '重複提醒' : '單次提醒';
  return replyOrPush(event, client, {
    type:'template',
    altText:'確認刪除提醒',
    template:{
      type:'confirm',
      text:`要刪除這筆「${label}」嗎？`,
      actions:[
        { type:'postback', label:'✅ 確認', data:`action=confirm_delete&type=${type}&id=${id}` },
        { type:'postback', label:'取消', data:'action=cancel_reminder' }
      ]
    }
  });
}

async function handleConfirmDelete(event, db, client) {
  const p = parseQuery(event.postback?.data);
  const { type, id } = p;
  if (!type || !id) {
    return replyOrPush(event, client, { type:'text', text:'⚠️ 刪除參數缺失' });
  }
  try {
    if (type === 'repeat') {
      await db.collection('repeatingReminders').doc(id).delete();
    } else {
      await db.collection('time').doc(id).delete();
    }
    return replyOrPush(event, client, { type:'text', text:'✅ 已刪除提醒' });
  } catch (e) {
    console.error('[delete] error:', e);
    return replyOrPush(event, client, { type:'text', text:'⚠️ 刪除失敗，請稍後再試' });
  }
}

// ========= Postback Router =========
async function handleReminderPostback(event, db, client) {
  if (event.type !== 'postback') return false;
  const data = event.postback?.data || '';

  // 單次提醒
  if (data === 'action=create_single_reminder') { await replyTimePicker(event, client); return true; }
  if (data === 'action=select_time')            { await handleSelectTime(event, client); return true; }
  if (data === 'action=confirm_reminder')       { await handleConfirmReminder(event, db, client); return true; }

  // 重複提醒
  if (data === 'action=create_repeating_reminder') { await replyRepeatingTimeSetup(event, client); return true; }
  if (data === 'action=select_repeating_time')     { await handleSelectRepeatingTime(event, client); return true; }
  if (data.startsWith('action=toggle_weekday'))    { await handleToggleWeekday(event, client); return true; }
  if (data === 'action=confirm_repeating_reminder'){ await handleConfirmRepeatingReminder(event, db, client); return true; }

  // 清單 / 刪除
  if (data === 'action=list_reminders')         { await sendReminderCarousel(event, db, client); return true; }
  if (data.startsWith('action=prepare_delete')) { await handlePrepareDelete(event, db, client); return true; }
  if (data.startsWith('action=confirm_delete')) { await handleConfirmDelete(event, db, client); return true; }
  if (data === 'action=cancel_reminder')        { await replyOrPush(event, client, { type:'text', text:'已取消設定。' }); return true; }

  return false;
}

module.exports = {
  buildTimeMenuFlex,
  handleReminderPostback,
  replyOrPush,
  replyTimePicker,
  handleSelectTime,
  handleConfirmReminder,
  replyRepeatingTimeSetup,
  handleSelectRepeatingTime,
  handleToggleWeekday,
  handleConfirmRepeatingReminder,
  sendReminderCarousel,
  handlePrepareDelete,
  handleConfirmDelete
};

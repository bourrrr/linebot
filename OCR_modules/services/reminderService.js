// 修改後的 timeflex.js - 提供更完整的選項
function buildTimeMenuFlex() {
  return {
    "type": "flex",
    "altText": "用藥提醒操作",
    "contents": {
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "spacing": "md",
        "contents": [
          {
            "type": "text",
            "text": "💊 用藥提醒設定",
            "weight": "bold",
            "size": "lg",
            "color": "#333333"
          },
          {
            "type": "text",
            "text": "請選擇提醒類型：",
            "size": "sm",
            "color": "#666666",
            "wrap": true
          }
        ]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "spacing": "sm",
        "contents": [
          {
            "type": "button",
            "style": "primary",
            "action": {
              "type": "postback",
              "label": "📅 單次提醒",
              "data": "action=create_single_reminder"
            }
          },
          {
            "type": "button",
            "style": "secondary",
            "action": {
              "type": "postback",
              "label": "🔄 重複提醒",
              "data": "action=create_repeating_reminder"
            }
          },
          {
            "type": "button",
            "style": "secondary",
            "action": {
              "type": "postback",
              "label": "📋 查看我的提醒",
              "data": "action=list_reminders"
            }
          }
        ]
      }
    }
  };
}

// 新增到 reminderService.js 的功能

// 1. 建立重複提醒的時間選擇
async function replyRepeatingTimeSetup(event, client) {
  return replyOrPush(event, client, {
    type: 'template',
    altText: '設定重複提醒時間',
    template: {
      type: 'buttons',
      title: '⏰ 設定重複提醒',
      text: '請先選擇提醒的時間',
      actions: [
        {
          type: 'datetimepicker',
          label: '選擇時間',
          data: 'action=select_repeating_time',
          mode: 'time' // 只選時間，不選日期
        }
      ]
    }
  });
}
async function replyOrPush(event, client, message) {
  if (event.replyToken) {
    return client.replyMessage(event.replyToken, message);
  }
  const userId = event?.source?.userId;
  if (!userId) throw new Error('replyOrPush: no replyToken or userId');
  return client.pushMessage(userId, message);
}
// 2. 處理重複提醒時間選擇
async function handleSelectRepeatingTime(event, client) {
  const userId = event.source?.userId;
  const timeStr = event.postback?.params?.time; // "08:00"
  
  if (!userId || !timeStr) {
    return replyOrPush(event, client, { 
      type: 'text', 
      text: '⚠️ 未取得時間，請重新選擇' 
    });
  }

  const [hour, minute] = timeStr.split(':').map(Number);
  
  // 暫存到 cache
  reminderCache[userId] = { 
    hour, 
    minute, 
    type: 'repeating' 
  };

  // 顯示星期選擇介面
  return replyOrPush(event, client, {
    type: 'flex',
    altText: '選擇重複的星期',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '📅 選擇重複的星期',
            weight: 'bold',
            size: 'md'
          },
          {
            type: 'text',
            text: `提醒時間：${timeStr}`,
            size: 'sm',
            color: '#666666'
          },
          {
            type: 'text',
            text: '請選擇要在哪些天重複提醒：',
            size: 'sm',
            wrap: true
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'xs',
            contents: [
              {
                type: 'button',
                flex: 1,
                style: 'secondary',
                action: {
                  type: 'postback',
                  label: '日',
                  data: 'action=toggle_weekday&day=0'
                }
              },
              {
                type: 'button',
                flex: 1,
                style: 'secondary',
                action: {
                  type: 'postback',
                  label: '一',
                  data: 'action=toggle_weekday&day=1'
                }
              },
              {
                type: 'button',
                flex: 1,
                style: 'secondary',
                action: {
                  type: 'postback',
                  label: '二',
                  data: 'action=toggle_weekday&day=2'
                }
              },
              {
                type: 'button',
                flex: 1,
                style: 'secondary',
                action: {
                  type: 'postback',
                  label: '三',
                  data: 'action=toggle_weekday&day=3'
                }
              }
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'xs',
            contents: [
              {
                type: 'button',
                flex: 1,
                style: 'secondary',
                action: {
                  type: 'postback',
                  label: '四',
                  data: 'action=toggle_weekday&day=4'
                }
              },
              {
                type: 'button',
                flex: 1,
                style: 'secondary',
                action: {
                  type: 'postback',
                  label: '五',
                  data: 'action=toggle_weekday&day=5'
                }
              },
              {
                type: 'button',
                flex: 1,
                style: 'secondary',
                action: {
                  type: 'postback',
                  label: '六',
                  data: 'action=toggle_weekday&day=6'
                }
              },
              {
                type: 'button',
                flex: 1,
                style: 'primary',
                action: {
                  type: 'postback',
                  label: '完成',
                  data: 'action=confirm_repeating_reminder'
                }
              }
            ]
          }
        ]
      }
    }
  });
}

// 3. 處理星期選擇切換
async function handleToggleWeekday(event, client) {
  const userId = event.source?.userId;
  const params = parseQuery(event.postback?.data || '');
  const day = parseInt(params.day);
  
  if (!userId || isNaN(day)) {
    return replyOrPush(event, client, { 
      type: 'text', 
      text: '⚠️ 選擇錯誤，請重試' 
    });
  }

  const cache = reminderCache[userId];
  if (!cache) {
    return replyOrPush(event, client, { 
      type: 'text', 
      text: '⚠️ 請重新設定提醒' 
    });
  }

  // 切換星期選擇狀態
  if (!cache.weekdays) cache.weekdays = [];
  const idx = cache.weekdays.indexOf(day);
  if (idx >= 0) {
    cache.weekdays.splice(idx, 1); // 移除
  } else {
    cache.weekdays.push(day); // 添加
  }

  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
  const selectedDays = cache.weekdays.sort().map(d => weekdayNames[d]).join('、');
  
  return replyOrPush(event, client, {
    type: 'text',
    text: `已選擇：星期${selectedDays || '(無)'}\n\n請繼續選擇或按「完成」確認設定。`
  });
}

// 4. 確認建立重複提醒
async function handleConfirmRepeatingReminder(event, db, client) {
  const userId = event.source?.userId;
  const cache = reminderCache[userId];
  
  if (!userId || !cache || !cache.weekdays || cache.weekdays.length === 0) {
    return replyOrPush(event, client, { 
      type: 'text', 
      text: '⚠️ 請至少選擇一個星期' 
    });
  }

  // 建立重複提醒記錄
  await db.collection('repeatingReminders').add({
    userId,
    hour: cache.hour,
    minute: cache.minute,
    weekdays: cache.weekdays,
    active: true,
    createdAt: admin.firestore.Timestamp.now()
  });

  // 清除 cache
  delete reminderCache[userId];

  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
  const selectedDays = cache.weekdays.sort().map(d => weekdayNames[d]).join('、');
  const timeStr = `${String(cache.hour).padStart(2, '0')}:${String(cache.minute).padStart(2, '0')}`;
  
  return replyOrPush(event, client, {
    type: 'text',
    text: `✅ 已設定重複提醒！\n⏰ 時間：${timeStr}\n📅 重複：每週${selectedDays}`
  });
}

// 5. 更新 postback router
async function handleReminderPostback(event, db, client) {
  if (event.type !== 'postback') return false;
  const data = event.postback?.data || '';

  // 原有的單次提醒流程
  if (data === 'action=create_single_reminder')    { await replyTimePicker(event, client); return true; }
  if (data === 'action=select_time')               { await handleSelectTime(event, client); return true; }
  if (data === 'action=confirm_reminder')          { await handleConfirmReminder(event, db, client); return true; }
  
  // 新增的重複提醒流程
  if (data === 'action=create_repeating_reminder') { await replyRepeatingTimeSetup(event, client); return true; }
  if (data === 'action=select_repeating_time')     { await handleSelectRepeatingTime(event, client); return true; }
  if (data.startsWith('action=toggle_weekday'))    { await handleToggleWeekday(event, client); return true; }
  if (data === 'action=confirm_repeating_reminder'){ await handleConfirmRepeatingReminder(event, db, client); return true; }
  
  // 其他既有功能
  if (data === 'action=list_reminders')            { await sendReminderCarousel(event, db, client); return true; }
  if (data.startsWith('action=prepare_delete'))    { await handlePrepareDelete(event, db, client); return true; }
  if (data.startsWith('action=confirm_delete'))    { await handleConfirmDelete(event, db, client); return true; }
  if (data === 'action=cancel_reminder')           { await replyOrPush(event, client, { type:'text', text:'已取消設定。' }); return true; }

  return false;
}

module.exports = {
  buildTimeMenuFlex, // 如果這個函數在這個檔案
  handleReminderPostback,
  
  replyOrPush,
};
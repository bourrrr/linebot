// OCR_modules/menu/richmenu-setup.js（修正版）
const fs = require('fs');
const { Client } = require('@line/bot-sdk');

function getLineClient() {
  return new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
  });
}

// 用記憶體暫存兩個 Rich Menu 的 ID
let richMenuIds = { care: null, service: null };

// 重新建立兩個 Rich Menu（用 message 切換）
async function rebuildRichMenus() {
  const client = getLineClient();

  try {
    console.log('🚀 開始重建 Rich Menus (使用 message 切換)...');

    // 1) 砍掉所有舊的
    const existing = await client.getRichMenuList();
    for (const rm of existing) {
      await client.deleteRichMenu(rm.richMenuId);
    }

    const size = { width: 2500, height: 1686 };

    // 2) 社區服務 (care) — Top bar 應在「左半邊」→ 送出「切換到健康照護」
    const careMenuData = {
      size,
      selected: false,
      name: 'MakeWell-社區服務',
      chatBarText: 'MakeWell',
      areas: [
        {
          // 左半邊可點：切到健康照護
          bounds: { x: 0, y: 0, width: 1250, height: 220 },
         action: { type: 'postback', data: 'switch=service' }
        },
        { bounds: { x: 1069, y: 450, width: 680, height: 450 },
          action: { type: 'message', text: '藥局地圖' } },
        { bounds: { x: 1794, y: 450, width: 680, height: 450 },
          action: { type: 'message', text: '飲食推薦' } },
        { bounds: { x: 1125, y: 1013, width: 1280, height: 460 },
          action: { type: 'message', text: '志工配對' } }
      ]
    };

    const careRichMenu = await client.createRichMenu(careMenuData);
    richMenuIds.care = careRichMenu;

    const careImagePath = './OCR_modules/menu/assets/richmenu-care.png';
    if (!fs.existsSync(careImagePath)) throw new Error(`圖片文件不存在: ${careImagePath}`);
    await client.setRichMenuImage(careRichMenu, fs.createReadStream(careImagePath));
    console.log('✅ 社區服務選單建立完成');

    // 3) 健康照護 (service) — Top bar 應在「右半邊」→ 送出「切換到社區服務」
    const serviceMenuData = {
      size,
      selected: false,
      name: 'MakeWell-健康照護',
      chatBarText: 'MakeWell',
      areas: [
        {
          // 右半邊可點：切到社區服務
          bounds: { x: 1250, y: 0, width: 1250, height: 220 },
          action: { type: 'postback', data: 'switch=care' }
        },
        { bounds: { x: 71, y: 440, width: 640, height: 450 },
          action: { type: 'message', text: '功能說明' } },
        { bounds: { x: 786, y: 441, width: 640, height: 450 },
          action: { type: 'message', text: '健康數據紀錄' } },
        { bounds: { x: 71, y: 1045, width: 640, height: 450 },
          action: { type: 'message', text: '用藥提醒' } },
        { bounds: { x: 786, y: 1045, width: 640, height: 450 },
          action: { type: 'uri', uri: 'https://medwell-test1.web.app/newcard/indexcard.html' } }
      ]
    };

    const serviceRichMenu = await client.createRichMenu(serviceMenuData);
    richMenuIds.service = serviceRichMenu;

    const serviceImagePath = './OCR_modules/menu/assets/richmenu-service.png';
    if (!fs.existsSync(serviceImagePath)) throw new Error(`圖片文件不存在: ${serviceImagePath}`);
    await client.setRichMenuImage(serviceRichMenu, fs.createReadStream(serviceImagePath));
    console.log('✅ 健康照護選單建立完成');

    // 4) 預設選單設為社區服務
    await client.setDefaultRichMenu(careRichMenu);
    console.log('🎉 Rich Menu 重建完成！', richMenuIds);

    return { careRichMenu, serviceRichMenu, richMenuIds };
  } catch (error) {
    console.error('❌ Rich Menu 重建失敗:', error?.response?.data || error);
    throw error;
  }
}

// 啟動後或第一次切換時，自動把 ID 從 LINE 抓回來
async function ensureIdsLoaded() {
  if (richMenuIds.care && richMenuIds.service) return;
  const client = getLineClient();
  const list = await client.getRichMenuList();
  const care = list.find(m => m.name === 'MakeWell-社區服務');
  const service = list.find(m => m.name === 'MakeWell-健康照護');
  if (care) richMenuIds.care = care.richMenuId;
  if (service) richMenuIds.service = service.richMenuId;
}

// 依 menuType ('care' | 'service') 連結選單
async function switchRichMenu(userId, menuType = 'care') {
  const client = getLineClient();
  await ensureIdsLoaded();
  const menuId = menuType === 'care' ? richMenuIds.care : richMenuIds.service;
  if (!menuId) throw new Error(`找不到 ${menuType} 選單 ID，請先重建選單`);
  await client.linkRichMenuToUser(userId, menuId);
  console.log(`✅ 用戶 ${userId} 已切換到 ${menuType} 選單`);
  return { success: true, userId, menuType, menuId };
}

// 只換圖（維持 ID 不變）
async function updateRichMenuImage(menuTypeOrAlias, imagePath) {
  const client = getLineClient();
  let richMenuId;

  if (menuTypeOrAlias === 'care' || menuTypeOrAlias === 'service') {
    await ensureIdsLoaded();
    richMenuId = richMenuIds[menuTypeOrAlias];
    if (!richMenuId) throw new Error(`找不到 ${menuTypeOrAlias} 選單 ID，請先重建選單`);
  } else {
    const alias = await client.getRichMenuAlias(menuTypeOrAlias);
    richMenuId = alias.richMenuId;
  }

  if (!imagePath || !fs.existsSync(imagePath)) throw new Error(`圖片文件不存在: ${imagePath}`);
  await client.setRichMenuImage(richMenuId, fs.createReadStream(imagePath));
  console.log(`✅ Rich Menu 圖片更新成功: ${richMenuId}`);
  return { menuType: menuTypeOrAlias, richMenuId, imagePath };
}

function getCurrentRichMenuIds() {
  return { ...richMenuIds };
}

module.exports = {
  rebuildRichMenus,
  updateRichMenuImage,
  switchRichMenu,
  getCurrentRichMenuIds
};

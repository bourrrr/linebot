// OCR_modules/menu/richmenu-setup.js (修改版)
const fs = require('fs');
const { Client } = require('@line/bot-sdk');

function getLineClient() {
  return new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
  });
}

// 儲存 Rich Menu ID 到記憶體
let richMenuIds = {
  care: null,
  service: null
};

// A. 完整重建（使用 message 而非 richmenuswitch）
async function rebuildRichMenus() {
  const client = getLineClient();

  try {
    console.log('🚀 開始重建 Rich Menus (使用 message 切換)...');

    // 1. 刪除現有的 Rich Menu
    console.log('📝 獲取現有 Rich Menu 列表...');
    const existing = await client.getRichMenuList();
    console.log(`找到 ${existing.length} 個現有 Rich Menu`);
    
    for (const rm of existing) {
      console.log(`刪除 Rich Menu: ${rm.richMenuId}`);
      await client.deleteRichMenu(rm.richMenuId);
    }

    // 2. 跳過 alias 處理
    console.log('⏭️ 跳過 alias 處理，使用 message 方式');

    const size = { width: 2500, height: 1686 };

    // 社區服務 Menu
    console.log('📋 創建社區服務 Rich Menu...');
    const careMenuData = {
      size,
      selected: false,
      name: 'MakeWell-社區服務',
      chatBarText: 'MakeWell',
      areas: [
        { 
          // Top bar：用訊息觸發切換
          bounds: { x: 1250, y: 0, width: 1250, height: 220 },
          action: { type: 'message', text: '切換到社區服務' }
        },
        { 
          bounds: { x: 1069, y: 450, width: 680, height: 450 }, 
          action: { type: 'message', text: '藥局地圖' } 
        },
        { 
          bounds: { x: 1794, y: 450, width: 680, height: 450 }, 
          action: { type: 'message', text: '飲食推薦' } 
        },
        { 
          bounds: { x: 1125, y: 1013, width: 1280, height: 460 }, 
          action: { type: 'message', text: '志工配對' } 
        }
      ]
    };

    const careRichMenu = await client.createRichMenu(careMenuData);
    richMenuIds.care = careRichMenu;
    console.log(`✅ 社區服務 Rich Menu 創建成功: ${careRichMenu}`);

    // 檢查並上傳圖片
    const careImagePath = './OCR_modules/menu/assets/richmenu-care.png';
    if (!fs.existsSync(careImagePath)) {
      throw new Error(`圖片文件不存在: ${careImagePath}`);
    }
    await client.setRichMenuImage(careRichMenu, fs.createReadStream(careImagePath));
    console.log('✅ 社區服務選單圖片上傳成功');

    // 健康照護 Menu
    console.log('📋 創建健康照護 Rich Menu...');
    const serviceMenuData = {
      size,
      selected: false,
      name: 'MakeWell-健康照護',
      chatBarText: 'MakeWell',
      areas: [
        {
          // Top bar：用訊息觸發切換
          bounds: { x: 0, y: 0, width: 1250, height: 220 },
          action: { type: 'message', text: '切換到健康照護' }
        },
        { 
          bounds: { x: 71, y: 440, width: 640, height: 450 }, 
          action: { type: 'message', text: '功能說明' } 
        },
        { 
          bounds: { x: 786, y: 441, width: 640, height: 450 }, 
          action: { type: 'message', text: '健康數據紀錄' } 
        },
        { 
          bounds: { x: 71, y: 1045, width: 640, height: 450 }, 
          action: { type: 'message', text: '用藥提醒' } 
        },
        { 
          bounds: { x: 786, y: 1045, width: 640, height: 450 }, 
          action: { 
            type: 'uri', 
            uri: 'https://medwell-test1.web.app/newcard/indexcard.html' 
          } 
        }
      ]
    };

    const serviceRichMenu = await client.createRichMenu(serviceMenuData);
    richMenuIds.service = serviceRichMenu;
    console.log(`✅ 健康照護 Rich Menu 創建成功: ${serviceRichMenu}`);

    // 檢查並上傳圖片
    const serviceImagePath = './OCR_modules/menu/assets/richmenu-service.png';
    if (!fs.existsSync(serviceImagePath)) {
      throw new Error(`圖片文件不存在: ${serviceImagePath}`);
    }
    await client.setRichMenuImage(serviceRichMenu, fs.createReadStream(serviceImagePath));
    console.log('✅ 健康照護選單圖片上傳成功');

    // 設定預設選單
    await client.setDefaultRichMenu(careRichMenu);
    console.log('✅ 設定預設 Rich Menu 成功');

    console.log('🎉 Rich Menu 重建完成！');
    console.log(`📋 社區服務 ID: ${careRichMenu}`);
    console.log(`📋 健康照護 ID: ${serviceRichMenu}`);

    return { careRichMenu, serviceRichMenu, richMenuIds };

  } catch (error) {
    console.error('❌ Rich Menu 重建失敗:', error?.response?.data || error);
    throw error;
  }
}

// 手動切換 Rich Menu 的函數
async function switchRichMenu(userId, menuType = 'care') {
  const client = getLineClient();
  
  try {
    const menuId = menuType === 'care' ? richMenuIds.care : richMenuIds.service;
    
    if (!menuId) {
      throw new Error(`找不到 ${menuType} 選單 ID，請先重建選單`);
    }

    await client.linkRichMenuToUser(userId, menuId);
    console.log(`✅ 用戶 ${userId} 已切換到 ${menuType} 選單`);
    
    return { success: true, userId, menuType, menuId };

  } catch (error) {
    console.error(`❌ 切換選單失敗:`, error?.response?.data || error);
    throw error;
  }
}
// 放在 richmenu-setup.js 內
async function ensureIdsLoaded() {
  if (richMenuIds.care && richMenuIds.service) return;

  const client = getLineClient();
  const list = await client.getRichMenuList();

  // 依你建立時的 name 來找（見 rebuildRichMenus 裡的 name）
  const care = list.find(m => m.name === 'MakeWell-社區服務');
  const service = list.find(m => m.name === 'MakeWell-健康照護');

  if (care) richMenuIds.care = care.richMenuId;
  if (service) richMenuIds.service = service.richMenuId;
}

// 修改 switchRichMenu：進來就先補 ID
async function switchRichMenu(userId, menuType = 'care') {
  const client = getLineClient();
  await ensureIdsLoaded(); // ← 新增

  const menuId = menuType === 'care' ? richMenuIds.care : richMenuIds.service;
  if (!menuId) throw new Error(`找不到 ${menuType} 選單 ID，請先重建選單`);

  await client.linkRichMenuToUser(userId, menuId);
  return { success: true, userId, menuType, menuId };
}

// B. 只換圖（保持原有功能）
async function updateRichMenuImage(menuTypeOrAlias, imagePath) {
  const client = getLineClient();
  
  try {
    let richMenuId;
    
    // 如果是新的方式（menuType: 'care' 或 'service'）
    if (menuTypeOrAlias === 'care' || menuTypeOrAlias === 'service') {
      richMenuId = richMenuIds[menuTypeOrAlias];
      if (!richMenuId) {
        throw new Error(`找不到 ${menuTypeOrAlias} 選單 ID，請先重建選單`);
      }
    } else {
      // 舊的方式（aliasId），為了向下相容
      const alias = await client.getRichMenuAlias(menuTypeOrAlias);
      richMenuId = alias.richMenuId;
    }

    if (!richMenuId) {
      throw new Error(`找不到對應的 richMenuId`);
    }

    if (!imagePath || !fs.existsSync(imagePath)) {
      throw new Error(`圖片文件不存在: ${imagePath}`);
    }

    await client.setRichMenuImage(richMenuId, fs.createReadStream(imagePath));
    console.log(`✅ Rich Menu 圖片更新成功: ${richMenuId}`);
    
    return { menuType: menuTypeOrAlias, richMenuId, imagePath };

  } catch (error) {
    console.error(`❌ 更新 Rich Menu 圖片失敗:`, error?.response?.data || error);
    throw error;
  }
}

// 獲取當前儲存的 Rich Menu IDs
function getCurrentRichMenuIds() {
  return { ...richMenuIds };
}

module.exports = { 
  rebuildRichMenus, 
  updateRichMenuImage,
  switchRichMenu,
  getCurrentRichMenuIds
};
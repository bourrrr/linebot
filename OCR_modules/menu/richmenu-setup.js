// OCR_modules/menu/richmenu-setup-no-alias.js
const fs = require('fs');
const { Client } = require('@line/bot-sdk');

function getLineClient() {
  return new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
  });
}

// 儲存 Rich Menu ID 到記憶體（生產環境建議存到資料庫）
let richMenuIds = {
  care: null,
  service: null
};

// A. 完整重建（不使用 alias，用 message 觸發切換）
async function rebuildRichMenus() {
  const client = getLineClient();

  try {
    console.log('🚀 開始重建 Rich Menus (不使用 alias)...');

    // 1. 刪除現有的 Rich Menu
    console.log('📝 獲取現有 Rich Menu 列表...');
    const existing = await client.getRichMenuList();
    console.log(`找到 ${existing.length} 個現有 Rich Menu`);
    
    for (const rm of existing) {
      console.log(`刪除 Rich Menu: ${rm.richMenuId}`);
      await client.deleteRichMenu(rm.richMenuId);
    }

    // 2. 不再處理 alias（完全跳過）
    console.log('⏭️ 跳過 alias 處理');

    // 3. 創建新的 Rich Menu
    const size = { width: 2500, height: 1686 };

    // 社區服務 Menu (使用 message 而非 richmenuswitch)
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
          action: { type: 'message', text: '切換到健康照護' }
        },
        { 
          // 藥局地圖
          bounds: { x: 1069, y: 450, width: 680, height: 450 }, 
          action: { type: 'message', text: '藥局地圖' } 
        },
        { 
          // 飲食推薦
          bounds: { x: 1794, y: 450, width: 680, height: 450 }, 
          action: { type: 'message', text: '飲食推薦' } 
        },
        { 
          // 志工配對
          bounds: { x: 1125, y: 1013, width: 1280, height: 460 }, 
          action: { type: 'message', text: '志工配對' } 
        }
      ]
    };

    const careRichMenu = await client.createRichMenu(careMenuData);
    richMenuIds.care = careRichMenu; // 儲存 ID
    console.log(`✅ 社區服務 Rich Menu 創建成功: ${careRichMenu}`);

    // 檢查並上傳圖片
    const careImagePath = './OCR_modules/menu/assets/richmenu-care.png';
    if (!fs.existsSync(careImagePath)) {
      throw new Error(`圖片文件不存在: ${careImagePath}`);
    }
    await client.setRichMenuImage(careRichMenu, fs.createReadStream(careImagePath));
    console.log('✅ 社區服務選單圖片上傳成功');

    // 健康照護 Menu (使用 message 而非 richmenuswitch)
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
          action: { type: 'message', text: '切換到社區服務' }
        },
        { 
          // 功能說明
          bounds: { x: 71, y: 440, width: 640, height: 450 }, 
          action: { type: 'message', text: '功能說明' } 
        },
        { 
          // 健康數據紀錄
          bounds: { x: 786, y: 441, width: 640, height: 450 }, 
          action: { type: 'message', text: '健康數據紀錄' } 
        },
        { 
          // 用藥提醒
          bounds: { x: 71, y: 1045, width: 640, height: 450 }, 
          action: { type: 'message', text: '用藥提醒' } 
        },
        { 
          // 外部連結
          bounds: { x: 786, y: 1045, width: 640, height: 450 }, 
          action: { 
            type: 'uri', 
            uri: 'https://medwell-test1.web.app/newcard/indexcard.html' 
          } 
        }
      ]
    };

    const serviceRichMenu = await client.createRichMenu(serviceMenuData);
    richMenuIds.service = serviceRichMenu; // 儲存 ID
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

// 批量切換用戶選單
async function switchRichMenuForAllUsers(menuType = 'care') {
  const client = getLineClient();
  
  try {
    const menuId = menuType === 'care' ? richMenuIds.care : richMenuIds.service;
    
    if (!menuId) {
      throw new Error(`找不到 ${menuType} 選單 ID，請先重建選單`);
    }

    // 注意：這會影響所有用戶，請謹慎使用
    await client.setDefaultRichMenu(menuId);
    console.log(`✅ 所有用戶的預設選單已切換到 ${menuType}`);
    
    return { success: true, menuType, menuId };

  } catch (error) {
    console.error(`❌ 批量切換選單失敗:`, error?.response?.data || error);
    throw error;
  }
}

// B. 只換圖（直接用 Rich Menu ID）
async function updateRichMenuImage(menuType, imagePath) {
  const client = getLineClient();
  
  try {
    if (!menuType || !imagePath) {
      throw new Error('menuType 和 imagePath 都是必填');
    }

    // 檢查圖片文件是否存在
    if (!fs.existsSync(imagePath)) {
      throw new Error(`圖片文件不存在: ${imagePath}`);
    }

    const richMenuId = menuType === 'care' ? richMenuIds.care : richMenuIds.service;
    
    if (!richMenuId) {
      throw new Error(`找不到 ${menuType} 選單 ID，請先重建選單`);
    }

    console.log(`🔄 開始更新 Rich Menu 圖片: ${menuType}`);
    
    await client.setRichMenuImage(richMenuId, fs.createReadStream(imagePath));
    console.log(`✅ Rich Menu 圖片更新成功: ${menuType} -> ${richMenuId}`);
    
    return { menuType, richMenuId, imagePath };

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
  switchRichMenuForAllUsers,
  getCurrentRichMenuIds
};
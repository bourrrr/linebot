// OCR_modules/menu/richmenu-setup.js
const fs = require('fs');
const { Client } = require('@line/bot-sdk');

function getLineClient() {
  return new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
  });
}

// 先嘗試 update，不行再 create（避免 alias 已存在時 400 衝突）
async function upsertAlias(client, richMenuAliasId, richMenuId) {
  try {
    await client.updateRichMenuAlias(richMenuAliasId, { richMenuId }); // 已存在 → 指到新 menu
    console.log(`✅ 成功更新 alias: ${richMenuAliasId}`);
  } catch (updateError) {
    console.log(`❌ 更新 alias 失敗，嘗試創建: ${richMenuAliasId}`);
    try {
      await client.createRichMenuAlias({ richMenuAliasId, richMenuId }); // 不存在 → 建立
      console.log(`✅ 成功創建 alias: ${richMenuAliasId}`);
    } catch (createError) {
      console.error(`❌ 創建 alias 失敗: ${richMenuAliasId}`, createError?.response?.data || createError);
      throw createError;
    }
  }
}

// A. 完整重建（刪舊建新 + 綁 alias + 設預設）
async function rebuildRichMenus() {
  const client = getLineClient();

  try {
    console.log('🚀 開始重建 Rich Menus...');

    // 1. 刪除現有的 Rich Menu
    console.log('📝 獲取現有 Rich Menu 列表...');
    const existing = await client.getRichMenuList();
    console.log(`找到 ${existing.length} 個現有 Rich Menu`);
    
    for (const rm of existing) {
      console.log(`刪除 Rich Menu: ${rm.richMenuId}`);
      await client.deleteRichMenu(rm.richMenuId);
    }

    // 2. 刪除現有的 alias（忽略錯誤）
    const aliasesToDelete = ['alias-care-v2-care', 'alias-care-v2-service'];
    for (const aliasId of aliasesToDelete) {
      try {
        await client.deleteRichMenuAlias(aliasId);
        console.log(`✅ 刪除 alias: ${aliasId}`);
      } catch (err) {
        console.log(`⚠️ alias 不存在或已刪除: ${aliasId}`);
      }
    }

    // 3. 創建新的 Rich Menu
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
          // Top bar：切換到健康照護
          bounds: { x: 1250, y: 0, width: 1250, height: 220 },
          action: { 
            type: 'richmenuswitch', 
            richMenuAliasId: 'alias-care-v2-service', 
            data: 'to-service' 
          }
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
    console.log(`✅ 社區服務 Rich Menu 創建成功: ${careRichMenu}`);

    // 檢查圖片文件是否存在
    const careImagePath = './OCR_modules/menu/assets/richmenu-care.png';
    if (!fs.existsSync(careImagePath)) {
      throw new Error(`圖片文件不存在: ${careImagePath}`);
    }

    await client.setRichMenuImage(careRichMenu, fs.createReadStream(careImagePath));
    console.log('✅ 社區服務選單圖片上傳成功');

    await upsertAlias(client, 'alias-care-v2-care', careRichMenu);

    // 健康照護 Menu
    console.log('📋 創建健康照護 Rich Menu...');
    const serviceMenuData = {
      size,
      selected: false,
      name: 'MakeWell-健康照護',
      chatBarText: 'MakeWell',
      areas: [
        {
          // Top bar：切換到社區服務
          bounds: { x: 0, y: 0, width: 1250, height: 220 },
          action: { 
            type: 'richmenuswitch', 
            richMenuAliasId: 'alias-care-v2-care', 
            data: 'to-care' 
          }
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
    console.log(`✅ 健康照護 Rich Menu 創建成功: ${serviceRichMenu}`);

    // 檢查圖片文件是否存在
    const serviceImagePath = './OCR_modules/menu/assets/richmenu-service.png';
    if (!fs.existsSync(serviceImagePath)) {
      throw new Error(`圖片文件不存在: ${serviceImagePath}`);
    }

    await client.setRichMenuImage(serviceRichMenu, fs.createReadStream(serviceImagePath));
    console.log('✅ 健康照護選單圖片上傳成功');

    await upsertAlias(client, 'alias-care-v2-service', serviceRichMenu);

    // 設定預設選單
    await client.setDefaultRichMenu(careRichMenu);
    console.log('✅ 設定預設 Rich Menu 成功');

    console.log('🎉 Rich Menu 重建完成！');
    return { careRichMenu, serviceRichMenu };

  } catch (error) {
    console.error('❌ Rich Menu 重建失敗:', error?.response?.data || error);
    throw error;
  }
}

// B. 只換圖（alias → 找 richMenuId → setRichMenuImage）
async function updateRichMenuImage(aliasId, imagePath) {
  const client = getLineClient();
  
  try {
    if (!aliasId) throw new Error('aliasId 是必填');
    if (!imagePath) throw new Error('imagePath 是必填');

    // 檢查圖片文件是否存在
    if (!fs.existsSync(imagePath)) {
      throw new Error(`圖片文件不存在: ${imagePath}`);
    }

    console.log(`🔄 開始更新 Rich Menu 圖片: ${aliasId}`);
    
    const alias = await client.getRichMenuAlias(aliasId); // { richMenuAliasId, richMenuId }
    const richMenuId = alias.richMenuId;
    
    if (!richMenuId) {
      throw new Error(`找不到 alias: ${aliasId} 對應的 richMenuId`);
    }

    await client.setRichMenuImage(richMenuId, fs.createReadStream(imagePath));
    console.log(`✅ Rich Menu 圖片更新成功: ${aliasId} -> ${richMenuId}`);
    
    return { aliasId, richMenuId, imagePath };

  } catch (error) {
    console.error(`❌ 更新 Rich Menu 圖片失敗:`, error?.response?.data || error);
    throw error;
  }
}

module.exports = { rebuildRichMenus, updateRichMenuImage };
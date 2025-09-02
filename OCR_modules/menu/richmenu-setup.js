// OCR_modules/menu/richmenu-setup.js
const fs = require('fs');
const { Client } = require('@line/bot-sdk');

function getLineClient() {
  return new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
  });
}

/** 先嘗試 update，不行再 create（避免 alias 已存在時 400 衝突） */
async function upsertAlias(client, richMenuAliasId, richMenuId) {
  try {
    await client.updateRichMenuAlias(richMenuAliasId, { richMenuId }); // 已存在 → 指向新 menu
  } catch (e) {
    await client.createRichMenuAlias({ richMenuAliasId, richMenuId }); // 不存在 → 建立
  }
}

// ✅ A. 完整重建（刪舊建新 + 綁定 alias + 設預設）
async function rebuildRichMenus() {
  const client = getLineClient();

  // 1) 先刪除「舊 Rich Menu 本體」
  const existing = await client.getRichMenuList();
  for (const rm of existing) await client.deleteRichMenu(rm.richMenuId);

  // 2)（選擇性）嘗試刪除舊 alias，忽略不存在的錯誤
  for (const a of ['alias-care-v2-care', 'alias-care-v2-service']) {
    try { await client.deleteRichMenuAlias(a); } catch (_) {}
  }

  const size = { width: 2500, height: 1686 };

  // ====== A. 社區服務 分頁 ======
  const careRichMenu = await client.createRichMenu({
    size,
    selected: false,
    name: 'MakeWell-社區服務',
    chatBarText: 'MakeWell',
    areas: [
      // 只留一個 top-bar 切換（避免重疊）
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 220 },
        action: { type: 'richmenuswitch', richMenuAliasId: 'alias-care-v2-service', data: 'to-service' }
      },
      { bounds: { x: 1069, y: 450, width: 680, height: 450 }, action: { type: 'message', text: '藥局地圖' } },
      { bounds: { x: 1794, y: 450, width: 680, height: 450 }, action: { type: 'message', text: '飲食推薦' } },
      { bounds: { x: 1125, y: 1013, width: 1280, height: 460 }, action: { type: 'message', text: '志工配對' } }
    ]
  });

  await client.setRichMenuImage(
    careRichMenu,
    fs.createReadStream('./OCR_modules/menu/assets/richmenu-care.png')
  );
  await upsertAlias(client, 'alias-care-v2-care', careRichMenu);

  // ====== B. 健康照護 分頁 ======
  const serviceRichMenu = await client.createRichMenu({
    size,
    selected: false,
    name: 'MakeWell-健康照護',
    chatBarText: 'MakeWell',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 220 },
        action: { type: 'richmenuswitch', richMenuAliasId: 'alias-care-v2-care', data: 'to-care' }
      },
      { bounds: { x:  71, y:  440, width: 640, height: 450 }, action: { type: 'message', text: '功能說明' } },
      { bounds: { x: 786, y:  441, width: 640, height: 450 }, action: { type: 'message', text: '健康數據紀錄' } },
      { bounds: { x:  71, y: 1045, width: 640, height: 450 }, action: { type: 'message', text: '用藥提醒' } },
      { bounds: { x: 786, y: 1045, width: 640, height: 450 }, action: { type: 'uri', uri: 'https://medwell-test1.web.app/newcard/indexcard.html' } }
    ]
  });

  await client.setRichMenuImage(
    serviceRichMenu,
    fs.createReadStream('./OCR_modules/menu/assets/richmenu-service.png')
  );
  await upsertAlias(client, 'alias-care-v2-service', serviceRichMenu);

  await client.setDefaultRichMenu(careRichMenu);
  return { careRichMenu, serviceRichMenu };
}

// ✅ B. 只換圖（透過 alias 取得現有 richMenuId → setRichMenuImage）
async function updateRichMenuImage(aliasId, imagePath) {
  const client = getLineClient();
  if (!aliasId) throw new Error('aliasId 是必填');
  if (!imagePath) throw new Error('imagePath 是必填');

  // 取回 alias 對應的 richMenuId
  const alias = await client.getRichMenuAlias(aliasId); // { richMenuAliasId, richMenuId }
  const richMenuId = alias.richMenuId;
  if (!richMenuId) throw new Error(`找不到 alias: ${aliasId} 對應的 richMenuId`);

  // 換圖片（不會新建、不會變動 areas）
  await client.setRichMenuImage(richMenuId, fs.createReadStream(imagePath));
  return { aliasId, richMenuId, imagePath };
}

module.exports = { rebuildRichMenus, updateRichMenuImage };

// richmenu-setup.js
const fs = require('fs');
const { Client } = require('@line/bot-sdk');

function getLineClient() {
  return new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
  });
}

async function setupRichMenus() {
  const client = getLineClient();

  // 先刪除舊的
  const existing = await client.getRichMenuList();
  for (const rm of existing) {
    await client.deleteRichMenu(rm.richMenuId);
  }

  const size = { width: 2500, height: 1686 };

  // ====== A. 社區服務 分頁 ======
  const careRichMenu = await client.createRichMenu({
 
    areas: [

      {
        bounds: { x: 1250, y: 0, width: 1250, height: 220 },
        action: { type: 'richmenuswitch', richMenuAliasId: 'alias-service', data: 'to-service' }
      },
      { bounds: { x: 1069, y: 450, width: 680, height: 450 },
        action: { type: 'message', text: '藥局地圖' } },
      { bounds: { x: 1794, y: 450, width: 680, height: 450 },
        action: { type: 'message', text: '飲食推薦' } },
      { bounds: { x: 1125, y: 1013, width: 1280, height: 460 },
        action: { type: 'message', text: '志工配對' } }
    ]
  });

  await client.setRichMenuImage(
    careRichMenu,
    fs.createReadStream('./OCR_modules/menu/assets/richmenu-care.png')
  );
  await client.createRichMenuAlias(careRichMenu, 'alias-care');

  // ====== B.健康照護 分頁 ======
  const serviceRichMenu = await client.createRichMenu({

    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 220 },
        action: { type: 'richmenuswitch', richMenuAliasId: 'alias-care', data: 'to-care' }
      },

      { bounds: { x: 71, y: 440, width: 640, height: 450 },
        action: { type: 'message', text: '功能說明' } },
      { bounds: { x: 786, y:441, width: 640, height: 450 },
        action: { type: 'message', text: '健康數據紀錄' } },
      { bounds: { x: 71, y: 1045, width: 640, height: 450 },
        action: { type: 'message', text: '用藥提醒' } },
      { bounds: { x: 786, y: 1045, width: 640, height: 450 },
        action: { type: 'uri', uri: 'https://medwell-test1.web.app/newcard/indexcard.html' } }
    ]
  });

  await client.setRichMenuImage(
    serviceRichMenu,
    fs.createReadStream('./OCR_modules/menu/assets/richmenu-service.png')
  );
  await client.createRichMenuAlias(serviceRichMenu, 'alias-service');

  await client.setDefaultRichMenu(careRichMenu);

  return { careRichMenu, serviceRichMenu };
}

module.exports = {
  setupRichMenus
};

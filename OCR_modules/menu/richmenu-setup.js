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

  // ====== A. 健康照護 分頁 ======
  const careRichMenu = await client.createRichMenu({
    size,
    selected: true,
    name: 'MakeWell-健康照護',
    chatBarText: 'MakeWell',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 220 },
        action: { type: 'message', text: '健康照護' }
      },
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 220 },
        action: { type: 'richmenuswitch', richMenuAliasId: 'alias-service', data: 'to-service' }
      },
      { bounds: { x: 1340, y: 260, width: 520, height: 380 },
        action: { type: 'message', text: '藥局地圖' } },
      { bounds: { x: 1900, y: 260, width: 520, height: 380 },
        action: { type: 'message', text: '志工配對' } },
      { bounds: { x: 80, y: 1200, width: 1200, height: 480 },
        action: { type: 'message', text: '飲食推薦' } }
    ]
  });

  await client.setRichMenuImage(
    careRichMenu,
    fs.createReadStream('./OCR_modules/menu/assets/richmenu-care.png')
  );
  await client.createRichMenuAlias(careRichMenu, 'alias-care');

  // ====== B. 社區服務 分頁 ======
  const serviceRichMenu = await client.createRichMenu({
    size,
    selected: false,
    name: 'MakeWell-社區服務',
    chatBarText: 'MakeWell',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 220 },
        action: { type: 'richmenuswitch', richMenuAliasId: 'alias-care', data: 'to-care' }
      },
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 220 },
        action: { type: 'message', text: '社區服務' }
      },
      { bounds: { x: 70, y: 450, width: 525, height: 380 },
        action: { type: 'message', text: '幫助' } },
      { bounds: { x: 654, y: 450, width: 520, height: 380 },
        action: { type: 'message', text: '健康數據紀錄' } },
      { bounds: { x: 70, y: 930, width: 520, height: 380 },
        action: { type: 'message', text: '用藥提醒' } },
      { bounds: { x: 654, y: 930, width: 525, height: 380 },
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

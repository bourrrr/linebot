const fs = require('fs');
const axios = require('axios');

const channelAccessToken = '94atJ6+sSP5pXt3wgHHUyNFaaq53Q+hs/nM79XLa4LO5A2LV0UGm7y1kUSLm+29qX16GkZAyOdE2BlxSaBfvl8BGeRLbHgUGQO+AUy8g6/LcdOB7Gdgd2bis2LH0HOuBQmKUVA52SpuTkr7+zFxrVgdB04t89/1O/w1cDnyilFU='; // <<< 換掉這裡！
const richMenuId = JSON.parse(fs.readFileSync('./richMenuId.json')).richMenuId;

axios.post(
  `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
  fs.readFileSync('./menu.png'),
  {
    headers: {
      Authorization: `Bearer 94atJ6+sSP5pXt3wgHHUyNFaaq53Q+hs/nM79XLa4LO5A2LV0UGm7y1kUSLm+29qX16GkZAyOdE2BlxSaBfvl8BGeRLbHgUGQO+AUy8g6/LcdOB7Gdgd2bis2LH0HOuBQmKUVA52SpuTkr7+zFxrVgdB04t89/1O/w1cDnyilFU=`,
      'Content-Type': 'image/png'
    }
  }
)
.then(() => {
  console.log('🖼 圖片上傳成功！');
})
.catch((err) => {
  console.error('❌ 上傳失敗：', err.response?.data || err.message);
});

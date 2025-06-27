const fs = require('fs');
const axios = require('axios');

const channelAccessToken = '4atJ6+sSP5pXt3wgHHUyNFaaq53Q+hs/nM79XLa4LO5A2LV0UGm7y1kUSLm+29qX16GkZAyOdE2BlxSaBfvl8BGeRLbHgUGQO+AUy8g6/LcdOB7Gdgd2bis2LH0HOuBQmKUVA52SpuTkr7+zFxrVgdB04t89/1O/w1cDnyilFU='; // <<< 換掉這裡！
const richMenuId = JSON.parse(fs.readFileSync('./richMenuId.json')).richMenuId;

axios.post(
  `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`,
  {},
  {
    headers: {
      Authorization: `Bearer 94atJ6+sSP5pXt3wgHHUyNFaaq53Q+hs/nM79XLa4LO5A2LV0UGm7y1kUSLm+29qX16GkZAyOdE2BlxSaBfvl8BGeRLbHgUGQO+AUy8g6/LcdOB7Gdgd2bis2LH0HOuBQmKUVA52SpuTkr7+zFxrVgdB04t89/1O/w1cDnyilFU=`
    }
  }
)
.then(() => {
  console.log('🎉 Rich Menu 綁定成功，所有用戶都會看到選單！');
})
.catch((err) => {
  console.error('❌ 綁定失敗：', err.response?.data || err.message);
});

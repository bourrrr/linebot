const axios = require('axios');

const channelAccessToken = '你的Channel Access Token'; // <<< 換成你自己的

const headers = {
  Authorization: `Bearer 94atJ6+sSP5pXt3wgHHUyNFaaq53Q+hs/nM79XLa4LO5A2LV0UGm7y1kUSLm+29qX16GkZAyOdE2BlxSaBfvl8BGeRLbHgUGQO+AUy8g6/LcdOB7Gdgd2bis2LH0HOuBQmKUVA52SpuTkr7+zFxrVgdB04t89/1O/w1cDnyilFU=`
};

// 如果是全部使用者取消 richmenu
axios.delete('https://api.line.me/v2/bot/user/all/richmenu', { headers })
  .then(() => {
    console.log('🚫 已成功取消所有使用者的 RichMenu');
  })
  .catch((err) => {
    console.error('❌ 取消失敗：', err.response?.data || err.message);
  });

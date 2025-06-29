const axios = require('axios');

const headers = {
  Authorization: 'Bearer {94atJ6+sSP5pXt3wgHHUyNFaaq53Q+hs/nM79XLa4LO5A2LV0UGm7y1kUSLm+29qX16GkZAyOdE2BlxSaBfvl8BGeRLbHgUGQO+AUy8g6/LcdOB7Gdgd2bis2LH0HOuBQmKUVA52SpuTkr7+zFxrVgdB04t89/1O/w1cDnyilFU=}',
  'Content-Type': 'application/json'
};

const menu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: "主功能選單",
  chatBarText: "功能選單",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 843 },
      action: { type: "message", text: "血壓地圖" }
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: { type: "uri", uri: "
https://linebot-o8nr.onrender.com/bp_map.html" }
    }
  ]
};

axios.post("https://api.line.me/v2/bot/richmenu", menu, { headers })
  .then((res) => {
    console.log("✅ RichMenu 建立成功：", res.data);
  })
  .catch((err) => {
    console.error("❌ 建立失敗：", err.response?.data || err);
  });

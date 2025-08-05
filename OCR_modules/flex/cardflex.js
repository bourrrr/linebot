function cardflex() {
  return {
    "type": "flex",
    "altText": "點我開啟健康抽卡",
    "contents": {
      "type": "bubble",
      "body": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "text",
            "text": "每日簽到抽卡，點這裡進入！"
          }
        ]
      },
      "footer": {
        "type": "box",
        "layout": "vertical",
        "contents": [
          {
            "type": "button",
            "action": {
              "type": "uri",
              "label": "開始抽卡",
              "uri": "https://medwell-test1.web.app/newcard/indexcard.html"
            }
          }
        ]
      }
    }
  };
}

module.exports = cardflex;

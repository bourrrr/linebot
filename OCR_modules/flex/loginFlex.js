// OCR_modules/flex/loginFlex.js

function loginFlex() {
  return {
    type: "flex",
    altText: "點擊登入 MakeWell 系統",
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "🔐 請登入 MakeWell 系統",
            weight: "bold",
            size: "xl",
            margin: "md"
          },
          {
            type: "text",
            text: "點擊下方按鈕登入會員",
            size: "sm",
            color: "#666666",
            wrap: true
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#2d8cf0",
            action: {
              type: "uri",
              label: "登入",
              uri: "https://medwell-test1.web.app/login.html" // 請填你部署後的公開網址
            }
          }
        ]
      }
    }
  };
}

module.exports = loginFlex;
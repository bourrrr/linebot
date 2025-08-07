// OCR_modules/flex/loginFlex.js

function loginFlex() {
  return {
    type: "flex",
    altText: "MakeWell 志工服務",
    contents: {
      type: "bubble",
      size: "mega",
      hero: {
        type: "image",
        url: "https://medwell-test1.web.app/photo/volunteer.png",
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover"
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "🤝 MakeWell 志工服務",
            weight: "bold",
            size: "xl",
            margin: "md"
          },
          {
            type: "text",
            text: "請選擇您的角色進行登入",
            size: "sm",
            color: "#666666",
            wrap: true
          }
        ]
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            flex: 1,
            style: "link",
            action: {
              type: "uri",
              label: "我是患者",
              uri: "https://medwell-test1.web.app/45678/login.html?role=患者"
            }
          },
          {
            type: "button",
            flex: 1,
            style: "link",
            action: {
              type: "uri",
              label: "我是志工",
              uri: "https://medwell-test1.web.app/45678/login.html?role=志工"
            }
          }
        ]
      }
    }
  };
}

module.exports = loginFlex;

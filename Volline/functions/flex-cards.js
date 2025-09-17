// flex-cards.js
function makeMatchCard(role, taskTitle, hospital, chatLink) {
  const header = role === "patient"
    ? "✅ 已為您配對志工"
    : "✅ 配對成功，請與患者聯繫";

  return {
    type: "flex",
    altText: "配對成功，已建立聊天室",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: header, weight: "bold", size: "lg" },
          { type: "text", text: `任務：${taskTitle || "未提供"}`, margin: "sm" },
          { type: "text", text: `地點：${hospital || "未提供醫院/診所"}`, margin: "sm" },
          {
            type: "button",
            style: "primary",
            action: { type: "uri", label: "📩 點我開始聊天", uri: chatLink },
            margin: "lg"
          }
        ]
      }
    }
  };
}

module.exports = { makeMatchCard };

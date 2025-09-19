// flex-cards.js
// flex-cards.js
function makeMatchCard(role, taskTitle, hospital, chatLink, otherName = "") {
  const header = role === "patient"
    ? "✅ 已為您配對志工"
    : "✅ 配對成功，請與患者聯繫";

  // 先建立內容陣列
  const contents = [
    { type: "text", text: header, weight: "bold", size: "lg" },
    { type: "text", text: `任務：${taskTitle || "未提供"}`, margin: "sm" },
    { type: "text", text: `地點：${hospital || "未提供醫院/診所"}`, margin: "sm" },
  ];

  // ⭐ 動態加上對方名字
  if (otherName) {
    const label = role === "patient" ? "志工" : "患者";
    contents.push({
      type: "text",
      text: `${label}：${otherName}`,
      size: "sm",
      wrap: true
    });
  }

  return {
    type: "flex",
    altText: "配對成功，已建立聊天室",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents
      }
      // footer 整個刪掉
    }
  };
}

module.exports = { makeMatchCard };

module.exports = { makeMatchCard };

const fs = require("fs");
const path = require("path");

async function saveImage(messageId, client) {
  const stream = await client.getMessageContent(messageId);
  const filename = `${messageId}.jpg`;

  const saveDir = path.join(__dirname, '../saved_images');  // ✅ 使用相對路徑
  const fullPath = path.join(saveDir, filename);

  // 確保資料夾存在
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(fullPath);
    stream.pipe(writeStream);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  return fullPath;
}

module.exports = saveImage;

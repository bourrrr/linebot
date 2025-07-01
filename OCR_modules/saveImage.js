const fs = require("fs");
const path = require("path");

async function saveImage(messageId, client) {
  const stream = await client.getMessageContent(messageId);
  const filename = `${messageId}.jpg`;
  const saveDir = "C:/Users/mexx0/linebot/saved_images";
  const fullPath = path.join(saveDir, filename);

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(fullPath);
    stream.pipe(writeStream);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  return fullPath;
}

module.exports = saveImage;

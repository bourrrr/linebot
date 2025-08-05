const vision = require('@google-cloud/vision');

// 這裡的 keyFilename 填 'google-vision-key.json' 路徑
const client = new vision.ImageAnnotatorClient({
  keyFilename: './google-vision-key.json'
});

async function main() {
  const [result] = await client.textDetection('./test.jpg');  // 你的圖片檔名
  const detections = result.textAnnotations;
  console.log('OCR 辨識結果:');
  detections.forEach(text => console.log(text.description));
}

main();

// OCR_modules/ocr.js
const Tesseract = require("tesseract.js");

async function runOCR(imagePath) {
  try {
    const result = await Tesseract.recognize(imagePath, "chi_tra", {
      logger: (m) => console.log(m.status, m.progress),
    });
    return result.data.text.trim();
  } catch (err) {
    console.error("OCR 錯誤：", err);
    return "⚠️ OCR 辨識失敗，請再試一次。";
  }
}

module.exports = runOCR;

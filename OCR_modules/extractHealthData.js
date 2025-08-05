// OCR_modules/extractHealthData.js

function extractHealthData(text) {
  // 正則抓血壓：血壓：120/80 mmHg
  const bpMatch = text.match(/血壓[:：]?\s*([\d]{2,3})[\/\-\\ ]([\d]{2,3})/i);
  // 血糖：98 mg/dL
  const sugarMatch = text.match(/血糖[:：]?\s*([\d]{2,3})/i);
  // 脈搏：76 / min
  const pulseMatch = text.match(/脈搏[:：]?\s*([\d]{2,3})/i);

  return {
    blood_pressure: bpMatch ? `${bpMatch[1]}/${bpMatch[2]}` : "",
    blood_sugar: sugarMatch ? sugarMatch[1] : "",
    pulse: pulseMatch ? pulseMatch[1] : ""
  }
}

module.exports = extractHealthData;

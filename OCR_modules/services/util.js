// OCR_modules/services/util.js

const SERVICE555_OA_ID = process.env.SERVICE555_OA_ID || '@676npmsr';

function buildService555Link(taskId) {
  const svcId = SERVICE555_OA_ID;
  const payload = taskId ? `#match:${taskId}` : '您好，我要聯絡志工服務555';
  return `https://line.me/R/oaMessage/${svcId}/?text=${encodeURIComponent(payload)}`;
}

module.exports = { buildService555Link };

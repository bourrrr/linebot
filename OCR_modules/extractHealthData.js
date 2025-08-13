// OCR_modules/extractHealthData.js

// OCR_modules/extractHealthData.js

// 全形→半形、常見符號統一
function toHalfWidth(str) {
  return str.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
            .replace(/\u3000/g, ' ');
}
function normalizeText(s) {
  return toHalfWidth(s || '')
    .replace(/[：]/g, ':')
    .replace(/[／]/g, '/')
    .replace(/℃/g, '°C')
    .replace(/\s+\n/g, '\n')
    .trim();
}
function splitLines(s) {
  return normalizeText(s).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// 單位換算
const conv = {
  glucose_mmolL_to_mgdl: v => v * 18.0182,
  chol_mmolL_to_mgdl: v => v * 38.67,
  tg_mmolL_to_mgdl: v => v * 88.57,
};
const r1 = x => Math.round(x * 10) / 10;

// 規則庫（含容錯）
const RX = {
  // ...原本規則保留，其餘略...
  pairBP: /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/,
  bpLine: /(血壓|BP|收縮壓|舒張壓)/i,
  sbp: /收縮壓[:\s]*?(\d{2,3})/i,
  dbp: /舒張壓[:\s]*?(\d{2,3})/i,

  pulse: /(脈搏|心跳|心率|Pulse|HR)[:\s]*?(\d{2,3})\s*(?:bpm|次\/?分|min)?/i,
  spo2: /(血氧|SpO2)[:\s]*?(\d{2,3})\s*%/i,
  temp: /(體溫|BT|Temp|體溫度)[:\s]*?(\d{2,3}(?:\.\d+)?)\s*(?:°C|度C|C)?/i,

  wt: /(體重|Weight|WT)[:\s]*?(\d{1,3}(?:\.\d+)?)\s*(?:kg|公斤)?/i,
  ht: /(身高|Height|HT)[:\s]*?(\d{2,3}(?:\.\d+)?)\s*(?:cm|公分|公厘)?/i,
  bmi: /(BMI|體質量指數)[:\s]*?(\d{1,2}(?:\.\d+)?)/i,
  waist: /(腰圍)[:\s]*?(\d{2,3}(?:\.\d+)?)\s*(?:cm|公分)?/i,
  fat: /(體脂|Body\s*Fat|BF)[:\s]*?(\d{1,2}(?:\.\d+)?)\s*%/i,

  // 血糖
  glu_f: /(空腹|餐前|飯前).{0,6}?(血糖|GLU|Glucose|FPG|AC)[:\s]*?(\d+(?:\.\d+)?)(?:\s*(mg\/dL|mmol\/L))?/i,
  glu_p: /(飯後|餐後).{0,6}?(血糖|GLU|Glucose|PPG|PC)[:\s]*?(\d+(?:\.\d+)?)(?:\s*(mg\/dL|mmol\/L))?/i,
  glu_any: /(血糖|GLU|Glucose)[:\s]*?(\d+(?:\.\d+)?)(?:\s*(mg\/dL|mmol\/L))?/i,

  a1c: /(HbA1c|A1C|糖化血色素)[:\s]*?(\d+(?:\.\d+)?)\s*%/i,

  // ★ 血脂：擴充分身名與連字號變體（TC/T-CHO、TG/T-G、HDL/HDL-C、LDL/LDL-C）
  tc: /(?:總膽固醇|血清總膽固醇|Cholester(?:ol)?|T-?CHO|TC)\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(?:mg\/?d[l1I]|mmol\/?L))?/i,
  tg: /(?:三酸甘油(?:脂|酯)|中性脂肪|Triglycerides?|T-?G|TG)\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(?:mg\/?d[l1I]|mmol\/?L))?/i,
  hdl: /(?:高密度膽固醇|HDL(?:-?C)?)(?:\s*Cholester(?:ol)?)?\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(?:mg\/?d[l1I]|mmol\/?L))?/i,
  ldl: /(?:低密度膽固醇|LDL(?:-?C)?)(?:\s*Cholester(?:ol)?)?\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(?:mg\/?d[l1I]|mmol\/?L))?/i,

  got: /(GOT|AST|SGOT)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:U\/L)?/i,
  gpt: /(GPT|ALT|SGPT)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:U\/L)?/i,

  ua: /(尿酸|Uric\s*Acid|UA)[:\s]*?(\d+(?:\.\d+)?)/i,
  bun: /(BUN|血尿素氮)[:\s]*?(\d+(?:\.\d+)?)/i,
  cr: /(肌(?:酸|酐)酐?|Creatinine|Creat|Cr)[:\s]*?(\d+(?:\.\d+)?)/i,
  egfr: /(eGFR)[:\s]*?(\d+(?:\.\d+)?)/i,

  // ★ 有些報告有「危險因子指數 / Risk」
  risk: /(危險因子指數|Risk)[:：]?\s*(\d+(?:\.\d+)?)\s*%?/i,
};

function setField(obj, key, val) {
  if (!val) return;
  if (obj[key] && obj[key] !== val) obj[key] = `${obj[key]} / ${val}`;
  else obj[key] = val;
}

function parseHealthMetrics(fullText) {
  const text = normalizeText(fullText);
  const lines = splitLines(text);
  const metrics = [];
  const fields = {};

  lines.forEach((line, idx) => {
    let m;
    if ((m = line.match(RX.pairBP))) {
      setField(fields, '血壓', `${m[1]}/${m[2]} mmHg`);
      metrics.push({ key: '血壓', value: `${m[1]}/${m[2]}`, unit: 'mmHg', line: idx });
    } else if (RX.bpLine.test(line)) {
      const ms = line.match(RX.sbp); const md = line.match(RX.dbp);
      if (ms && md) {
        setField(fields, '血壓', `${ms[1]}/${md[1]} mmHg`);
        metrics.push({ key: '血壓', value: `${ms[1]}/${md[1]}`, unit: 'mmHg', line: idx });
      }
    }

    if ((m = line.match(RX.pulse))) { setField(fields, '脈搏', `${m[2]} bpm`); metrics.push({ key: '脈搏', value: m[2], unit: 'bpm', line: idx }); }
    if ((m = line.match(RX.spo2))) { setField(fields, '血氧', `${m[2]} %`); metrics.push({ key: '血氧', value: m[2], unit: '%', line: idx }); }
    if ((m = line.match(RX.temp))) { setField(fields, '體溫', `${m[2]} °C`); metrics.push({ key: '體溫', value: m[2], unit: '°C', line: idx }); }

    if ((m = line.match(RX.wt)))   { setField(fields, '體重', `${m[2]} kg`); metrics.push({ key: '體重', value: m[2], unit: 'kg', line: idx }); }
    if ((m = line.match(RX.ht)))   { setField(fields, '身高', `${m[2]} cm`); metrics.push({ key: '身高', value: m[2], unit: 'cm', line: idx }); }
    if ((m = line.match(RX.bmi)))  { setField(fields, 'BMI', m[2]);         metrics.push({ key: 'BMI', value: m[2], unit: '', line: idx }); }
    if ((m = line.match(RX.waist))){ setField(fields, '腰圍', `${m[2]} cm`); metrics.push({ key: '腰圍', value: m[2], unit: 'cm', line: idx }); }
    if ((m = line.match(RX.fat)))  { setField(fields, '體脂', `${m[2]} %`);  metrics.push({ key: '體脂', value: m[2], unit: '%', line: idx }); }

    // 血糖（自動換算 mmol/L → mg/dL）
    if ((m = line.match(RX.glu_f))) {
      let v = parseFloat(m[3]); const u = (m[4] || 'mg/dL').toLowerCase();
      if (u.includes('mmol')) v = r1(conv.glucose_mmolL_to_mgdl(v));
      setField(fields, '血糖(空腹)', `${v} mg/dL`);
      metrics.push({ key: '血糖(空腹)', value: v, unit: 'mg/dL', line: idx });
    } else if ((m = line.match(RX.glu_p))) {
      let v = parseFloat(m[3]); const u = (m[4] || 'mg/dL').toLowerCase();
      if (u.includes('mmol')) v = r1(conv.glucose_mmolL_to_mgdl(v));
      setField(fields, '血糖(飯後)', `${v} mg/dL`);
      metrics.push({ key: '血糖(飯後)', value: v, unit: 'mg/dL', line: idx });
    } else if ((m = line.match(RX.glu_any))) {
      let v = parseFloat(m[2]); const u = (m[3] || 'mg/dL').toLowerCase();
      if (u.includes('mmol')) v = r1(conv.glucose_mmolL_to_mgdl(v));
      setField(fields, '血糖', `${v} mg/dL`);
      metrics.push({ key: '血糖', value: v, unit: 'mg/dL', line: idx });
    }

    if ((m = line.match(RX.a1c))) { setField(fields, 'HbA1c', `${m[2]} %`); metrics.push({ key: 'HbA1c', value: m[2], unit: '%', line: idx }); }

    // 血脂（自動換算 mmol/L → mg/dL）
    if ((m = line.match(RX.tc)))  { let v = parseFloat(m[2]); const u = (m[3] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.chol_mmolL_to_mgdl(v)); setField(fields, '總膽固醇', `${v} mg/dL`); metrics.push({ key: '總膽固醇', value: v, unit: 'mg/dL', line: idx }); }
    if ((m = line.match(RX.tg)))  { let v = parseFloat(m[2]); const u = (m[3] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.tg_mmolL_to_mgdl(v));   setField(fields, '三酸甘油脂', `${v} mg/dL`); metrics.push({ key: '三酸甘油脂', value: v, unit: 'mg/dL', line: idx }); }
    if ((m = line.match(RX.hdl))) { let v = parseFloat(m[2]); const u = (m[3] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.chol_mmolL_to_mgdl(v)); setField(fields, 'HDL', `${v} mg/dL`);    metrics.push({ key: 'HDL', value: v, unit: 'mg/dL', line: idx }); }
    if ((m = line.match(RX.ldl))) { let v = parseFloat(m[2]); const u = (m[3] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.chol_mmolL_to_mgdl(v)); setField(fields, 'LDL', `${v} mg/dL`);    metrics.push({ key: 'LDL', value: v, unit: 'mg/dL', line: idx }); }

    // 肝腎
    if ((m = line.match(RX.got))) { setField(fields, 'GOT(AST)', `${m[2]} U/L`); metrics.push({ key: 'GOT(AST)', value: m[2], unit: 'U/L', line: idx }); }
    if ((m = line.match(RX.gpt))) { setField(fields, 'GPT(ALT)', `${m[2]} U/L`); metrics.push({ key: 'GPT(ALT)', value: m[2], unit: 'U/L', line: idx }); }
    if ((m = line.match(RX.ua)))  { setField(fields, '尿酸', m[2]);           metrics.push({ key: '尿酸', value: m[2], unit: '', line: idx }); }
    if ((m = line.match(RX.bun))) { setField(fields, 'BUN', m[2]);            metrics.push({ key: 'BUN', value: m[2], unit: '', line: idx }); }
    if ((m = line.match(RX.cr)))  { setField(fields, 'Creatinine', m[2]);     metrics.push({ key: 'Creatinine', value: m[2], unit: '', line: idx }); }
    if ((m = line.match(RX.egfr))){ setField(fields, 'eGFR', m[2]);           metrics.push({ key: 'eGFR', value: m[2], unit: '', line: idx }); }
  });

  // 抓不到重點時，回傳等分行數作為備援
  let segmentsFallback = [];
  if (Object.keys(fields).length === 0 && lines.length >= 5) {
    const per = Math.floor(lines.length / 5);
    for (let i = 0; i < 5; i++) {
      const start = i * per;
      const end = (i === 4) ? lines.length : (i + 1) * per;
      segmentsFallback.push(lines.slice(start, end).join('\n'));
    }
  }

  return { fields, metrics, segmentsFallback, lines };
}

// 對外：維持舊的介面名稱，但回傳更完整
function extractHealthData(text)
 {
  const result = {};
  if (!text) return result;

  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  const keyHints = /^(血壓|血糖(?:\(空腹\)|\(飯後\))?|脈搏|心率|血氧|體溫|體重|身高|BMI|腰圍|體脂|HDL(?:-?C)?|LDL(?:-?C)?|高密度膽固醇|低密度膽固醇|總膽固醇|三酸甘油脂|GOT\(AST\)|GPT\(ALT\)|AST|ALT|SGOT|SGPT|尿酸|BUN|Creatinine|Creat|eGFR|Risk|危險因子指數)$/i;
  const valueLine = /^([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+(?:\.[0-9]+)?)?)\s*(?:[a-zA-Z%°/]+|mmHg|mg\/dl|g\/dl|bpm)?$/i;

  const normalizeMap = { '心率':'脈搏', '高密度膽固醇':'HDL', '低密度膽固醇':'LDL' };
  const nk = k => normalizeMap[k] || k;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1) 同行：欄位: 值／欄位 值
    let m = line.match(/^(.{1,30}?)[：:]\s*(.+)$/) || line.match(/^(.{1,30}?)\s{1,3}(.{1,50})$/);
    if (m) {
      const key = nk(m[1].trim());
      const val = m[2].trim();
      if (key && val && (!(key in result) || String(result[key] ?? '').trim() === '')) result[key] = val;
      continue;
    }

    // 2) 換行：這行像欄位，下一行像數值
    if (keyHints.test(line) && i + 1 < lines.length && valueLine.test(lines[i + 1])) {
      const key = nk(line);
      const val = lines[i + 1].trim();
      if (key && val && (!(key in result) || String(result[key] ?? '').trim() === '')) result[key] = val;
      i++;
    }
  }
  return result;
}


module.exports = extractHealthData;


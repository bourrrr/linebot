// OCR_modules/extractHealthData.js

// —— 單位正規化（容錯）——
function normalizeUnit(s = '') {
  return (s || '')
    .replace(/mg\/?dl/gi, 'mg/dL')
    .replace(/g\/?dl/gi, 'g/dL')
    .replace(/mmhg/gi, 'mmHg')
    .replace(/\/min/gi, 'bpm')   // 93/min → 93 bpm
    .replace(/\bkg\b/gi, 'kg')
    .replace(/\bcm\b/gi, 'cm')
    .replace(/度c|c度/gi, '°C');
}

// —— 全形→半形 + 常見符號統一 —— 
function toHalfWidth(str) {
  return (str || '')
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ');
}
function normalizeText(s) {
  return toHalfWidth(s)
    .replace(/[：]/g, ':')
    .replace(/[／]/g, '/')
    .replace(/℃/g, '°C')
    // 合併被換行或多空格切斷的英文
    .replace(/([A-Za-z])\s*\n\s*([A-Za-z])/g, '$1$2')
    .replace(/\s+\n/g, '\n')
    .trim();
}
function splitLines(s) {
  return normalizeText(s).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// —— 一列名稱、下一列數值、再下一列參考值/單位 → 合併成一行 —— 
// —— 一列名稱、下一列數值、再下一列參考值/單位 → 合併成一行 —— 
function collapseTableRows(rawText) {
  const lines = (rawText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const merged = [];

  // ⬇️ 這段換掉（放寬：允許 "Total Cholesterol"、名稱不一定在行首、以及英文後面黏到 1 的噪音）
  const isNameLike = (t) => {
    const s = t.replace(/(Cholesterol|Triglyceride|HDL|LDL)\s*1\b/i, '$1'); // 去噪：Cholesterol1 → Cholesterol
    return /(總膽固醇|血清總膽固醇|(?:Total\s*)?Cholesterol|三酸甘油|三酸甘油脂|中性脂肪|Triglyceride|HDL\s*Cholesterol|LDL\s*Cholesterol|HDL|LDL|血壓|脈搏|心率|血糖|BMI|身高|體重)/i.test(s);
  };
  const isValueLike = (t) => /^([<>]?\s*\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?|(?:\d{2,3}\s*\/\s*\d{2,3}))$/.test(t);
  const isRefLike   = (t) => /^[<>]\s*\d+(?:\.\d+)?|\d+\s*-\s*\d+$/i.test(t);
  const isUnitLike  = (t) => /^(mg\/?d[l1I]|mmol\/?L|mmHg|bpm|%|°C|cm|kg)$/i.test(t);

  for (let i = 0; i < lines.length; i++) {
    const a = lines[i];
    if (isNameLike(a)) {
      let val = '', ref = '', unit = '';
      if (i + 1 < lines.length && isValueLike(lines[i + 1])) { val  = lines[++i]; }
      if (i + 1 < lines.length && isRefLike(lines[i + 1]))   { ref  = lines[++i]; }
      if (i + 1 < lines.length && isUnitLike(lines[i + 1]))  { unit = lines[++i]; }
      const oneLine = [a, val, ref, unit].filter(Boolean).join(' ');
      merged.push(normalizeUnit(oneLine));
    } else {
      merged.push(normalizeUnit(a));
    }
  }
  return merged.join('\n');
}


// —— 單位換算 —— 
const conv = {
  glucose_mmolL_to_mgdl: v => v * 18.0182,
  chol_mmolL_to_mgdl: v => v * 38.67,
  tg_mmolL_to_mgdl: v => v * 88.57,
};
const r1 = x => Math.round(x * 10) / 10;

// —— 規則庫（含容錯）——
const RX = {
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

  glu_f: /(空腹|餐前|飯前).{0,6}?(血糖|GLU|Glucose|FPG|AC)[:\s]*?(\d+(?:\.\d+)?)(?:\s*(mg\/dL|mmol\/L))?/i,
  glu_p: /(飯後|餐後).{0,6}?(血糖|GLU|Glucose|PPG|PC)[:\s]*?(\d+(?:\.\d+)?)(?:\s*(mg\/dL|mmol\/L))?/i,
  glu_any: /(血糖|GLU|Glucose)[:\s]*?(\d+(?:\.\d+)?)(?:\s*(mg\/dL|mmol\/L))?/i,

  a1c: /(HbA1c|A1C|糖化血色素)[:\s]*?(\d+(?:\.\d+)?)\s*%/i,

  // ★ 單位設為「捕捉群組」(m[2])，方便拿來做 mmol/L → mg/dL 轉換
  tc: /(?:總膽固醇|血清總膽固醇|Cholester(?:ol)?|T-?CHO|TC)\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(mg\/?d[l1I]|mmol\/?L))?/i,
  tg: /(?:三酸甘油(?:脂|酯)|中性脂肪|Triglycerides?|T-?G|TG)\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(mg\/?d[l1I]|mmol\/?L))?/i,
  hdl: /(?:高密度膽固醇|HDL(?:-?C)?)(?:\s*Cholester(?:ol)?)?\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(mg\/?d[l1I]|mmol\/?L))?/i,
  ldl: /(?:低密度膽固醇|LDL(?:-?C)?)(?:\s*Cholester(?:ol)?)?\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(mg\/?d[l1I]|mmol\/?L))?/i,

  got: /(GOT|AST|SGOT)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:U\/L)?/i,
  gpt: /(GPT|ALT|SGPT)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:U\/L)?/i,
  ua: /(尿酸|Uric\s*Acid|UA)[:\s]*?(\d+(?:\.\d+)?)/i,
  bun: /(BUN|血尿素氮)[:\s]*?(\d+(?:\.\d+)?)/i,
  cr: /(肌(?:酸|酐)酐?|Creatinine|Creat|Cr)[:\s]*?(\d+(?:\.\d+)?)/i,
  egfr: /(eGFR)[:\s]*?(\d+(?:\.\d+)?)/i,

  risk: /(危險因子指數|Risk)[:：]?\s*(\d+(?:\.\d+)?)\s*%?/i,
};

function setField(obj, key, val) {
  if (!val) return;
  if (obj[key] && obj[key] !== val) obj[key] = `${obj[key]} / ${val}`;
  else obj[key] = val;
}

// —— 逐行解析 —— 
function parseHealthMetrics(fullText) {
  const text = normalizeText(fullText);
  const lines = splitLines(text);
  const fields = {};
  let m;

  lines.forEach((line, idx) => {
    // 血壓
    if ((m = line.match(RX.pairBP))) setField(fields, '血壓', `${m[1]}/${m[2]} mmHg`);
    else if (RX.bpLine.test(line)) {
      const ms = line.match(RX.sbp), md = line.match(RX.dbp);
      if (ms && md) setField(fields, '血壓', `${ms[1]}/${md[1]} mmHg`);
    }

    if ((m = line.match(RX.pulse))) setField(fields, '脈搏', `${m[2]} bpm`);
    if ((m = line.match(RX.spo2)))  setField(fields, '血氧', `${m[2]} %`);
    if ((m = line.match(RX.temp)))  setField(fields, '體溫', `${m[2]} °C`);

    if ((m = line.match(RX.wt)))    setField(fields, '體重', `${m[2]} kg`);
    if ((m = line.match(RX.ht)))    setField(fields, '身高', `${m[2]} cm`);
    if ((m = line.match(RX.bmi)))   setField(fields, 'BMI', m[2]);
    if ((m = line.match(RX.waist))) setField(fields, '腰圍', `${m[2]} cm`);
    if ((m = line.match(RX.fat)))   setField(fields, '體脂', `${m[2]} %`);

    // 血糖（自動把 mmol/L 轉 mg/dL）
    if ((m = line.match(RX.glu_f))) {
      let v = parseFloat(m[3]); const u = (m[4] || 'mg/dL').toLowerCase();
      if (u.includes('mmol')) v = r1(conv.glucose_mmolL_to_mgdl(v));
      setField(fields, '血糖(空腹)', `${v} mg/dL`);
    } else if ((m = line.match(RX.glu_p))) {
      let v = parseFloat(m[3]); const u = (m[4] || 'mg/dL').toLowerCase();
      if (u.includes('mmol')) v = r1(conv.glucose_mmolL_to_mgdl(v));
      setField(fields, '血糖(飯後)', `${v} mg/dL`);
    } else if ((m = line.match(RX.glu_any))) {
      let v = parseFloat(m[2]); const u = (m[3] || 'mg/dL').toLowerCase();
      if (u.includes('mmol')) v = r1(conv.glucose_mmolL_to_mgdl(v));
      setField(fields, '血糖', `${v} mg/dL`);
    }

    if ((m = line.match(RX.a1c))) setField(fields, 'HbA1c', `${m[2]} %`);

    // 血脂四項（索引修正：m[1] = 數值、m[2] = 單位）
    if ((m = line.match(RX.tc)))  { let v = parseFloat(m[1]); const u = (m[2] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.chol_mmolL_to_mgdl(v)); setField(fields, '總膽固醇', `${v} mg/dL`); }
    if ((m = line.match(RX.tg)))  { let v = parseFloat(m[1]); const u = (m[2] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.tg_mmolL_to_mgdl(v));   setField(fields, '三酸甘油脂', `${v} mg/dL`); }
    if ((m = line.match(RX.hdl))) { let v = parseFloat(m[1]); const u = (m[2] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.chol_mmolL_to_mgdl(v)); setField(fields, 'HDL',       `${v} mg/dL`); }
    if ((m = line.match(RX.ldl))) { let v = parseFloat(m[1]); const u = (m[2] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.chol_mmolL_to_mgdl(v)); setField(fields, 'LDL',       `${v} mg/dL`); }

    // 肝腎
    if ((m = line.match(RX.got))) setField(fields, 'GOT(AST)', `${m[2]} U/L`);
    if ((m = line.match(RX.gpt))) setField(fields, 'GPT(ALT)', `${m[2]} U/L`);
    if ((m = line.match(RX.ua)))  setField(fields, '尿酸', m[2]);
    if ((m = line.match(RX.bun))) setField(fields, 'BUN', m[2]);
    if ((m = line.match(RX.cr)))  setField(fields, 'Creatinine', m[2]);
    if ((m = line.match(RX.egfr)))setField(fields, 'eGFR', m[2]);
  });

  return { fields, lines };
}

// —— 對外：先合併表格/單位正規化，再解析 —— 
function extractHealthData(text) {
  if (!text) return {};
  const pre = collapseTableRows(normalizeText(text));
  const { fields } = parseHealthMetrics(pre);
  return fields;
}

window.extractHealthData = extractHealthData;


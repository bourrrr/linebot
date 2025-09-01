// extractHealthData.js  —  加大版（健檢名詞加強）

/* ========= 前處理 ========= */
function normalizeUnit(s = '') {
  return (s || '')
    .replace(/mg\/?dl/gi, 'mg/dL')
    .replace(/g\/?dl/gi, 'g/dL')
    .replace(/mmhg/gi, 'mmHg')
    .replace(/\/min/gi, 'bpm')
    .replace(/\bkg\b/gi, 'kg')
    .replace(/\bcm\b/gi, 'cm')
    .replace(/℃/g, '°C')
    .replace(/度c|c度/gi, '°C')
    .replace(/iu\/l/gi, 'U/L')
    .replace(/μ/gi, 'u');
}
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
    .replace(/([A-Za-z])\s*\n\s*([A-Za-z])/g, '$1$2')
    .replace(/\s+\n/g, '\n')
    .trim();
}
function splitLines(s) {
  return normalizeText(s).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/* ========= 表格分行 → 合併 ========= */
function collapseTableRows(rawText) {
  const lines = (rawText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const merged = [];

  const isNameLike = (t) => {
    const s = t.replace(/(Cholesterol|Triglyceride|HDL|LDL)\s*1\b/i, '$1');
    return /(身高|體重|BMI|腰圍|體脂|體溫|血壓|脈搏|心率|血氧|血糖|空腹|飯後|糖化|HbA1c|尿酸|BUN|肌酐|Creatinine|eGFR|GOT|AST|GPT|ALT|GGT|ALP|膽紅素|總膽固醇|三酸甘油脂|高密度膽固醇|低密度膽固醇|HDL|LDL|WBC|白血球|RBC|紅血球|Hb|HGB|血色素|HCT|PLT|血小板|MCV|MCH|MCHC|尿蛋白|尿糖|酮體|CRP|危險因子指數|Risk)/i.test(s);
  };
  const isValueLike = (t) => /^([<>]?\s*\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?|(?:\d{2,3}\s*\/\s*\d{2,3}))$/.test(t);
  const isRefLike   = (t) => /^[<>]\s*\d+(?:\.\d+)?|\d+\s*-\s*\d+$/i.test(t);
  const isUnitLike  = (t) => /^(mg\/?d[l1I]|mmol\/?L|u?mol\/?L|mmHg|bpm|%|°C|cm|kg|U\/L|g\/L|10\^9\/L|10\^12\/L)$/i.test(t);

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

/* ========= 換算 ========= */
const conv = {
  glucose_mmolL_to_mgdl: v => v * 18.0182,
  chol_mmolL_to_mgdl:    v => v * 38.67,
  tg_mmolL_to_mgdl:      v => v * 88.57,
  cr_umolL_to_mgdl:      v => v * 0.0113,
  ua_umolL_to_mgdl:      v => v * 0.01681,
  bun_mmolL_to_mgdl:     v => v * 2.801,
  f_to_c:                f => (f - 32) * 5/9
};
const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;

/* ========= 規則（中文名詞加強） ========= */
const RX = {
  // 生命徵象/一般資料
  pairBP: /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/,
  bpLine: /(血壓|BP|收縮壓|舒張壓)/i,
  sbp: /收縮壓[:\s]*?(\d{2,3})/i,
  dbp: /舒張壓[:\s]*?(\d{2,3})/i,
  pulse: /(脈搏|心跳|心率|Pulse|HR)[:\s]*?(\d{2,3})\s*(?:bpm|次\/?分|min)?/i,
  spo2: /(血氧|SpO2)[:\s]*?(\d{2,3})\s*%/i,
  tempC: /(體溫|BT|Temp|體溫度)[:\s]*?(\d{2,3}(?:\.\d+)?)\s*(?:°C|度C|C)\b/i,
  tempF: /(體溫|BT|Temp)[:\s]*?(\d{2,3}(?:\.\d+)?)\s*°?F\b/i,
  wt: /(體重|Weight|WT)[:\s]*?(\d{1,3}(?:\.\d+)?)\s*(?:kg|公斤)?/i,
  ht: /(身高|Height|HT)[:\s]*?(\d{2,3}(?:\.\d+)?)\s*(?:cm|公分|公厘)?/i,
  bmi: /(BMI|體質量指數)[:\s]*?(\d{1,2}(?:\.\d+)?)/i,
  waist: /(腰圍)[:\s]*?(\d{2,3}(?:\.\d+)?)\s*(?:cm|公分)?/i,
  fat: /(體脂|Body\s*Fat|BF)[:\s]*?(\d{1,2}(?:\.\d+)?)\s*%/i,
  risk: /(危險因子指數|Risk)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%?/i,

  // 血糖
  glu_f: /(空腹|餐前|飯前).{0,6}?(血糖|GLU|Glucose|FPG|AC)[:\s]*?(\d+(?:\.\d+)?)(?:\s*(mg\/dL|mmol\/L))?/i,
  glu_p: /(飯後|餐後).{0,6}?(血糖|GLU|Glucose|PPG|PC)[:\s]*?(\d+(?:\.\d+)?)(?:\s*(mg\/dL|mmol\/L))?/i,
  glu_any: /(血糖|GLU|Glucose)[:\s]*?(\d+(?:\.\d+)?)(?:\s*(mg\/dL|mmol\/L))?/i,
  a1c: /(HbA1c|A1C|糖化血色素)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%?/i,

  // 血脂四項
  tc: /(?:總膽固醇|血清總膽固醇|Cholester(?:ol)?|T-?CHO|TC)\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(mg\/?d[l1I]|mmol\/?L))?/i,
  tg: /(?:三酸甘油(?:脂|酯)|中性脂肪|Triglycerides?|T-?G|TG)\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(mg\/?d[l1I]|mmol\/?L))?/i,
  hdl:/(?:高密度膽固醇|HDL(?:-?C)?)(?:\s*Cholester(?:ol)?)?\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(mg\/?d[l1I]|mmol\/?L))?/i,
  ldl:/(?:低密度膽固醇|LDL(?:-?C)?)(?:\s*Cholester(?:ol)?)?\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(mg\/?d[l1I]|mmol\/?L))?/i,

  // 肝腎/發炎
  got: /(GOT|AST|SGOT|肝指數\(?:GOT|AST\)?)[\s:：]*?(\d+(?:\.\d+)?)\s*(?:U\/L)?/i,
  gpt: /(GPT|ALT|SGPT|肝指數\(?:GPT|ALT\)?)[\s:：]*?(\d+(?:\.\d+)?)\s*(?:U\/L)?/i,
  ggt: /(?:GGT|γ[-\s]?GT)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:U\/L)?/i,
  alp: /(?:ALP|Alkaline\s*Phosphatase)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:U\/L)?/i,
  tbil:/(?:T[-\s]?Bili|Total\s*Bilirubin|總膽紅素)\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  dbil:/(?:D[-\s]?Bili|Direct\s*Bilirubin|直接膽紅素)\s*[:：]?\s*(\d+(?:\.\d+)?)/i,
  crp: /(?:CRP|C[-\s]?Reactive\s*Protein)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/L|g\/L|mg\/dL)?/i,

  ua:  /(尿酸|Uric\s*Acid|UA)\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(mg\/dL|u?mol\/L))?/i,
  bun: /(BUN|血尿素氮)\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(mg\/dL|mmol\/L))?/i,
  cr:  /(肌(?:酸|酐)酐?|Creatinine|Creat|Cr)\s*[:：]?\s*(\d+(?:\.\d+)?)(?:\s*(mg\/dL|u?mol\/L))?/i,
  egfr:/(eGFR)\s*[:：]?\s*(\d+(?:\.\d+)?)/i,

  // CBC（中文名詞強化）
  wbc:/(?:WBC|白血球)[\s:：]*?(\d+(?:\.\d+)?)/i,
  rbc:/(?:RBC|紅血球)[\s:：]*?(\d+(?:\.\d+)?)/i,
  hb: /(?:Hb|HGB|血色素|血紅素)[\s:：]*?(\d+(?:\.\d+)?)/i,
  hct:/(?:HCT|血比容)[\s:：]*?(\d+(?:\.\d+)?)/i,
  plt:/(?:PLT|血小板)[\s:：]*?(\d+(?:\.\d+)?)/i,
  mcv:/MCV[\s:：]*?(\d+(?:\.\d+)?)/i,
  mch:/MCH[\s:：]*?(\d+(?:\.\d+)?)/i,
  mchc:/MCHC[\s:：]*?(\d+(?:\.\d+)?)/i,

  // 尿液
  urine_protein:/(?:尿蛋白|Protein\(Urine\))\s*[:：]?\s*(陰性|陽性|trace|\+{1,3}|-{1,3})/i,
  urine_glucose:/(?:尿糖|Glucose\(Urine\))\s*[:：]?\s*(陰性|陽性|trace|\+{1,3}|-{1,3})/i,
  urine_ketone:/(?:酮體|Ketone\(Urine\))\s*[:：]?\s*(陰性|陽性|trace|\+{1,3}|-{1,3})/i,
};

/* ========= 合併策略 ========= */
function setField(obj, key, val) {
  if (!val) return;
  if (obj[key] && obj[key] !== val) obj[key] = `${obj[key]} / ${val}`;
  else obj[key] = val;
}

/* ========= 解析主程式 ========= */
function parseHealthMetrics(fullText) {
  const text = normalizeText(fullText);
  const lines = splitLines(text);
  const fields = {};
  let m;

  lines.forEach((line) => {
    // 血壓
    if ((m = line.match(RX.pairBP))) setField(fields, '血壓', `${m[1]}/${m[2]} mmHg`);
    else if (RX.bpLine.test(line)) {
      const ms = line.match(RX.sbp), md = line.match(RX.dbp);
      if (ms && md) setField(fields, '血壓', `${ms[1]}/${md[1]} mmHg`);
    }

    // 生命徵象/一般
    if ((m = line.match(RX.pulse))) setField(fields, '脈搏', `${m[2]} bpm`);
    if ((m = line.match(RX.spo2)))  setField(fields, '血氧', `${m[2]} %`);
    if ((m = line.match(RX.tempC))) setField(fields, '體溫', `${m[2]} °C`);
    if ((m = line.match(RX.tempF))) setField(fields, '體溫', `${r1(conv.f_to_c(parseFloat(m[2])))} °C`);
    if ((m = line.match(RX.wt)))    setField(fields, '體重', `${m[2]} kg`);
    if ((m = line.match(RX.ht)))    setField(fields, '身高', `${m[2]} cm`);
    if ((m = line.match(RX.bmi)))   setField(fields, 'BMI', m[2]);
    if ((m = line.match(RX.waist))) setField(fields, '腰圍', `${m[2]} cm`);
    if ((m = line.match(RX.fat)))   setField(fields, '體脂', `${m[2]} %`);
    if ((m = line.match(RX.risk)))  setField(fields, '危險因子指數', m[2]);

    // 血糖
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

    // 血脂四項
    if ((m = line.match(RX.tc)))  { let v = parseFloat(m[1]); const u = (m[2] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.chol_mmolL_to_mgdl(v)); setField(fields, '總膽固醇', `${v} mg/dL`); }
    if ((m = line.match(RX.tg)))  { let v = parseFloat(m[1]); const u = (m[2] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.tg_mmolL_to_mgdl(v));   setField(fields, '三酸甘油脂', `${v} mg/dL`); }
    if ((m = line.match(RX.hdl))) { let v = parseFloat(m[1]); const u = (m[2] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.chol_mmolL_to_mgdl(v)); setField(fields, 'HDL',       `${v} mg/dL`); }
    if ((m = line.match(RX.ldl))) { let v = parseFloat(m[1]); const u = (m[2] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r1(conv.chol_mmolL_to_mgdl(v)); setField(fields, 'LDL',       `${v} mg/dL`); }

    // 肝腎/發炎
    if ((m = line.match(RX.got))) setField(fields, 'GOT(AST)', `${m[2]} U/L`);
    if ((m = line.match(RX.gpt))) setField(fields, 'GPT(ALT)', `${m[2]} U/L`);
    if ((m = line.match(RX.ggt))) setField(fields, 'GGT',      `${m[2]} U/L`);
    if ((m = line.match(RX.alp))) setField(fields, 'ALP',      `${m[2]} U/L`);
    if ((m = line.match(RX.tbil)))setField(fields, '總膽紅素', `${m[1]} mg/dL`);
    if ((m = line.match(RX.dbil)))setField(fields, '直接膽紅素', `${m[1]} mg/dL`);
    if ((m = line.match(RX.crp))) setField(fields, 'CRP', `${m[1]} mg/L`);

    if ((m = line.match(RX.ua)))  { let v = parseFloat(m[1]); const u = (m[2] || 'mg/dL').toLowerCase(); if (u.includes('mol')) v = r2(conv.ua_umolL_to_mgdl(v)); setField(fields, '尿酸', `${v} mg/dL`); }
    if ((m = line.match(RX.bun))) { let v = parseFloat(m[1]); const u = (m[2] || 'mg/dL').toLowerCase(); if (u.includes('mmol')) v = r2(conv.bun_mmolL_to_mgdl(v)); setField(fields, 'BUN', `${v} mg/dL`); }
    if ((m = line.match(RX.cr)))  { let v = parseFloat(m[1]); const u = (m[2] || 'mg/dL').toLowerCase(); if (u.includes('mol')) v = r2(conv.cr_umolL_to_mgdl(v));  setField(fields, 'Creatinine', `${v} mg/dL`); }
    if ((m = line.match(RX.egfr)))setField(fields, 'eGFR', `${m[2]}`);

    // CBC
    if ((m = line.match(RX.wbc))) setField(fields, '白血球(WBC)', m[1]);
    if ((m = line.match(RX.rbc))) setField(fields, '紅血球(RBC)', m[1]);
    if ((m = line.match(RX.hb)))  setField(fields, '血色素(Hb)',  m[1]);
    if ((m = line.match(RX.hct))) setField(fields, '血比容(HCT)', m[1]);
    if ((m = line.match(RX.plt))) setField(fields, '血小板(PLT)', m[1]);
    if ((m = line.match(RX.mcv))) setField(fields, 'MCV', m[1]);
    if ((m = line.match(RX.mch))) setField(fields, 'MCH', m[1]);
    if ((m = line.match(RX.mchc)))setField(fields, 'MCHC',m[1]);

    // 尿液
    if ((m = line.match(RX.urine_protein))) setField(fields, '尿蛋白', m[1]);
    if ((m = line.match(RX.urine_glucose))) setField(fields, '尿糖',   m[1]);
    if ((m = line.match(RX.urine_ketone)))  setField(fields, '酮體',   m[1]);
  });

  return { fields, lines };
}

/* ========= 對外 ========= */
function extractHealthData(text) {
  if (!text) return {};
  const pre = collapseTableRows(normalizeText(text));
  const { fields } = parseHealthMetrics(pre);
  return fields;
}
window.extractHealthData = extractHealthData;

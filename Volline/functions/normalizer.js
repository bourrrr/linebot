// functions/normalizer.js
const admin = require('firebase-admin'); // 讓 index.js 統一 initializeApp()

/** =========================
 *  A) 擴充 SEED (標準鍵 -> 已知別名)
 *  ========================= */
const SEED = {
  // 生命徵象
  '身高': ['Height','Ht'],
  '體重': ['Weight','Wt'],
  '體脂率': ['Body Fat','Body Fat %','BF%'],
  'BMI': ['Body Mass Index'],
  '血壓': ['BP','Blood Pressure'],
  '脈搏': ['Pulse','HR','Heart Rate'],
  '體溫': ['Temperature','Temp','BT'],
  '血氧': ['SpO2','Oxygen Saturation','Pulse Ox','O2 Sat'],

  // 血糖相關
  '血糖': ['Glucose','GLU','Blood Glucose','Plasma Glucose','Glucose (fasting)','AC Sugar','FPG','空腹血糖','Fasting Plasma Glucose'],
  'HbA1c': ['A1C','Glycohemoglobin','HbA1C','HbA1'],

  // 脂質
  '總膽固醇': ['Cholesterol','TC','Total Cholesterol','T-Cho','血清膽固醇','血清總膽固醇'],
  '三酸甘油脂': ['Triglyceride','TG','中性脂肪'],
  'HDL': ['HDL-C','High Density Lipoprotein','HDL Cholesterol','高密度膽固醇'],
  'LDL': ['LDL-C','Low Density Lipoprotein','LDL Cholesterol','低密度膽固醇'],
  '非HDL膽固醇': ['non-HDL','Non HDL Cholesterol'],

  // 腎功能
  '肌酸酐': ['Creatinine','CRE','Scr','Serum Creatinine'],
  '尿素氮': ['BUN','Urea Nitrogen'],
  '尿酸': ['Uric Acid','UA'],
  'eGFR': ['Estimated GFR','e-GFR','GFR'],

  // 肝功能
  'AST': ['GOT','Aspartate Aminotransferase'],
  'ALT': ['GPT','Alanine Aminotransferase'],
  'GGT': ['γ-GT','Gamma-GT','Gamma Glutamyl Transferase','γGT','γ GT','Gamma GT'],
  'ALP': ['Alkaline Phosphatase'],
  '總膽紅素': ['Total Bilirubin','TBIL','T-Bil'],
  '直接膽紅素': ['Direct Bilirubin','DBIL','D-Bil'],
  '間接膽紅素': ['Indirect Bilirubin','IBIL','I-Bil'],
  '白蛋白': ['Albumin','ALB'],
  '總蛋白': ['Total Protein','TP'],

  // 電解質
  '鈉': ['Sodium','Na'],
  '鉀': ['Potassium','K'],
  '氯': ['Chloride','Cl'],
  '鈣': ['Calcium','Ca'],
  '磷': ['Phosphorus','Phosphate','P'],
  '鎂': ['Magnesium','Mg'],

  // 血球（CBC）
  '白血球': ['WBC','White Blood Cell'],
  '紅血球': ['RBC','Red Blood Cell'],
  '血紅素': ['Hemoglobin','HGB','Hb'],
  '血比容': ['Hematocrit','HCT','Ht'],
  '血小板': ['Platelet','PLT'],
  'MCV': ['Mean Corpuscular Volume'],
  'MCH': ['Mean Corpuscular Hemoglobin'],
  'MCHC': ['Mean Corpuscular Hemoglobin Concentration'],

  // 發炎/免疫
  'CRP': ['C-Reactive Protein','hs-CRP','High Sensitivity CRP'],
  'ESR': ['Erythrocyte Sedimentation Rate'],

  // 甲狀腺
  'TSH': ['Thyroid Stimulating Hormone'],
  'FT4': ['Free T4','Free Thyroxine'],
  'FT3': ['Free T3','Free Triiodothyronine'],

  // 鐵代謝
  '血清鐵': ['Serum Iron','Fe'],
  '鐵蛋白': ['Ferritin'],
  '總鐵結合力': ['TIBC','Total Iron Binding Capacity'],

  // 維生素
  '維生素D': ['Vitamin D','25(OH)D','25-OH Vitamin D'],

  // 尿液（試紙）
  '尿蛋白': ['Urine Protein','PRO (urine)'],
  '尿糖': ['Urine Glucose','GLU (urine)'],
  '尿酮體': ['Ketone','KET'],
  '尿膽素原': ['Urobilinogen','URO'],
  '尿膽紅素': ['Bilirubin (urine)','BIL'],
  '潛血': ['Occult Blood','BLD','Blood (urine)'],
  '亞硝酸鹽': ['Nitrite','NIT'],
  '白血球酯酶': ['Leukocyte Esterase','LEU'],
  '尿比重': ['Specific Gravity','SG'],
  '尿酸鹼值': ['Urine pH','pH (urine)'],
};

const USE_GLUCOSE_TIMING = true; // 血糖自動加時段（空腹/餐前/餐後…）

/** =========================
 *  共用工具
 *  ========================= */
const normKey = (s='') => String(s)
  .normalize('NFKC')
  .replace(/[（(][A-Za-z0-9.\-\/\s]+[)）]/g, '')
  .replace(/[：:|｜/、,，;；\\]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

function getDb(){ return admin.firestore(); }

const keyIdForFirestore = (stdKey) => String(stdKey).replace(/\//g, '__');
const stdKeyFromId      = (docId)  => String(docId).replace(/__/g, '/');

function _nz(s=''){
  return String(s || '')
    .normalize('NFKC')
    .replace(/[()（）\[\]{}]/g,' ')
    .replace(/[：:|｜/、,，;；\\]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
}

/** =========================
 *  垃圾 / 敏感 過濾
 *  ========================= */
const SENSITIVE_HEADERS = new Set([
  '基本資料','個人資料','患者資料','健檢報告','健康報告','健康數據',
  '項目','數值','單位','參考範圍','參考值','檢查日期','檢查時間',
  'report date','collection date','specimen','accession number','specimen number'
].map(_nz));

const SENSITIVE_TOKENS = new Set([
  '姓名','性別','年齡','身分證','身份證','id','idno','id number',
  '病歷號碼','mrn','chart no','patient id','患者','住址','地址',
  '電話','手機','phone','mobile','緊急連絡人','emergency contact',
  '報告日期','收件日期','檢體編號'
].map(_nz));

const looksLikeDate   = s => /^\d{4}[\/\-\.年]\d{1,2}([\/\-\.月]\d{1,2})?([日])?$/.test(s);
const looksLikeId     = s => /^[a-z]\d{9}$/i.test(s);
const looksLikePhone  = s => /^0\d{1,2}-?\d{6,8}$/.test(s) || /^09\d{2}-?\d{3}-?\d{3}$/.test(s);
const looksDivider    = s => /^[<>\-_.=＋*~─—]+$/.test(s);

function looksLikeGarbageKey(k='') {
  const s = String(k).trim();
  if (!s) return true;
  if (/^(mg\/dL|g\/dL|mmHg|bpm|cm|kg|%)$/i.test(s)) return true;
  if (/^\d+(\.\d+)?$/.test(s)) return true;
  if (/^\d+\s*[-~～]\s*\d+$/.test(s)) return true;
  // 單位/英文 + 可選冒號 + 數字範圍 例：'mg/dL 70-100'、'Unit: 5~10'
  if (/^[A-Za-z%/]+(?:\s*[:：])?\s*\d+(\.\d+)?\s*[-~～]\s*\d+(\.\d+)?$/.test(s)) return true;
  if (/^[<>]=?\s*\d+/.test(s)) return true;
  if (/男.*女/.test(s)) return true; // 參考值敘述
  return false;
}
function isSensitiveKey(k=''){
  const nk = _nz(k);
  if (!nk) return true;
  if (SENSITIVE_HEADERS.has(nk) || SENSITIVE_TOKENS.has(nk)) return true;
  if (looksDivider(nk)) return true;
  if (nk.includes('基本資料')) return true;
  const parts = nk.split(' ').filter(Boolean);
  if (parts.some(p => SENSITIVE_HEADERS.has(p) || SENSITIVE_TOKENS.has(p))) return true;
  return false;
}
function isSensitiveValue(v=''){
  const nv = _nz(v);
  if (!nv) return false;
  if (SENSITIVE_HEADERS.has(nv)) return true;
  if (looksDivider(nv)) return true;
  if (looksLikeDate(nv) || looksLikeId(nv) || looksLikePhone(nv)) return true;
  for (const t of SENSITIVE_TOKENS){ if (nv.includes(t)) return true; }
  if (nv.includes('基本資料')) return true;
  return false;
}

/** =========================
 *  C) 針對常見縮寫的正則規則（補強命中）
 *  ========================= */
const REGEX_ALIASES = [
  { std: 'HbA1c', re: /\b(hba1c|a1c|glyco.?hemoglobin)\b/i },
  { std: 'AST',   re: /\b(ast|got)\b/i },
  { std: 'ALT',   re: /\b(alt|gpt)\b/i },
  { std: 'GGT',   re: /\b(γ?-?\s?gt|ggt|gamma.?gt)\b/i },
  { std: 'HDL',   re: /\bhdl(-?c)?\b/i },
  { std: 'LDL',   re: /\bldl(-?c)?\b/i },
  { std: 'eGFR',  re: /\begfr\b/i },
  { std: 'CRP',   re: /\b(hs-)?crp\b/i },
];

/** =========================
 *  血糖時段偵測
 *  ========================= */
function detectGlucoseTiming(rawKey='') {
  if (/(空腹|ac|fasting|fpg|pre[-\s]?prandial|pre[-\s]?meal)/i.test(rawKey)) return '空腹';
  if (/(2\s*h|\b2hr\b|\b2h\b|120\s*min|pp2|pp 2|post[-\s]?prandial.*2)/i.test(rawKey) || /(餐後|飯後).*(2|二)\s*小時/.test(rawKey)) return '餐後2hr';
  if (/(1\s*h|\b1hr\b|\b1h\b|60\s*min|pp1|pp 1|post[-\s]?prandial.*1)/i.test(rawKey) || /(餐後|飯後).*(1|一)\s*小時/.test(rawKey)) return '餐後1hr';
  if (/(餐後|飯後|pp\b|post[-\s]?prandial)/i.test(rawKey)) return '餐後';
  if (/(餐前|pre[-\s]?meal)/i.test(rawKey)) return '餐前';
  return null;
}

/** =========================
 *  建立映射
 *  ========================= */
async function buildAliasMaps() {
  const db = getDb();
  const aliasToStd = new Map();
  const stdToAliases = new Map();

  // SEED 先載入
  for (const [std, arr] of Object.entries(SEED)) {
    stdToAliases.set(std, new Set(arr));
    aliasToStd.set(normKey(std), std);
    arr.forEach(a => aliasToStd.set(normKey(a), std));
  }

  // Firestore 詞庫（含子鍵：血糖/空腹 → '血糖__空腹'）
  const snap = await db.collection('key_alias').get();
  snap.forEach(doc => {
    const std = stdKeyFromId(doc.id);
    const aliases = (doc.data().aliases || []).filter(Boolean);
    if (!stdToAliases.has(std)) stdToAliases.set(std, new Set());
    aliasToStd.set(normKey(std), std);
    aliases.forEach(a => {
      stdToAliases.get(std).add(a);
      aliasToStd.set(normKey(a), std);
    });
  });

  return { aliasToStd, stdToAliases };
}

/** =========================
 *  主流程：標準化 + 自動學習
 *  ========================= */
// ……前略（你的檔案保持不變）

async function normalizeData(data, { learn = true, moderated = true } = {}) {
  const db = getDb();
  const { aliasToStd, stdToAliases } = await buildAliasMaps();

  const normalized = {};
  const learned = [];

  for (const [rawKey, rawVal] of Object.entries(data || {})) {
    // 你原本的過濾/比對/時段判斷 ……
    // （略）得到 targetKey 與 val 後：
    normalized[targetKey] = val;

    if (learn && std && nRaw !== normKey(std) && !looksLikeGarbageKey(rawKey)) {
      const stdForAlias = targetKey;
      const set = stdToAliases.get(stdForAlias) || new Set();
      if (!set.has(rawKey)) {
        learned.push({ std: stdForAlias, alias: rawKey });
        if (!stdToAliases.has(stdForAlias)) stdToAliases.set(stdForAlias, new Set());
        stdToAliases.get(stdForAlias).add(rawKey);
      }
    }
  }

  // ====== 這裡開始是你要替換/新增的部分 ======
  if (learned.length) {
    if (moderated) {
      // 審核模式：先寫 pending_aliases，避免汙染正式詞庫
      const batch = db.batch();
      const col = db.collection('pending_aliases');
      const now = admin.firestore.FieldValue.serverTimestamp();
      for (const { std, alias } of learned) {
        const id = makePendingId(std, alias); // 唯一鍵，避免重覆
        batch.set(col.doc(id), {
          std, alias,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          stdId: keyIdForFirestore(std), // 方便管理頁顯示/查詢
          normStd: normKey(std),
          normAlias: normKey(alias),
          // 你也可附加來源，例如來源文件ID/使用者ID
          // sourceDoc: ctx?.params?.id,
        }, { merge: true });
      }
      await batch.commit();
    } else {
      // 直寫 key_alias（舊行為）
      const batch = db.batch();
      const grouped = {};
      for (const { std, alias } of learned) (grouped[std] ||= []).push(alias);
      for (const [std, arr] of Object.entries(grouped)) {
        const ref = db.collection('key_alias').doc(keyIdForFirestore(std));
        batch.set(ref, {
          aliases: admin.firestore.FieldValue.arrayUnion(...arr),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      await batch.commit();
    }
  }
  // ====== 替換到這裡為止 ======

  return { normalized, learned };
}

// 產生 pending 的穩定 ID：<std>__PENDING__<hash(alias)>
function makePendingId(std, alias) {
  const base = `${keyIdForFirestore(std)}__PENDING__${normKey(alias)}`;
  // Firestore docId 長度限制很寬，直接用即可；如需更短可加 hash
  return base.slice(0, 500);
}

module.exports = { normalizeData, normKey, __SEED_FOR_SEEDING: SEED };


// 匯出給 index.js 使用；同時暴露 SEED 方便 B) 匯入腳本使用
module.exports = { normalizeData, normKey, __SEED_FOR_SEEDING: SEED };

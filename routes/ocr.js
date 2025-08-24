// routes/ocr.js
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

const router = express.Router();
router.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

const PROJECT_ID   = process.env.GCLOUD_PROJECT;              // 860851688843
const LOCATION     = process.env.DOC_AI_LOCATION || 'us';     // us
const PROCESSOR_ID = process.env.DOC_AI_PROCESSOR_ID;         // 1532cddc0a86eb53

// 從環境變數載入憑證(JSON 字串)
const creds = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? { credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS) }
  : undefined;

const client = new DocumentProcessorServiceClient(creds);

router.post('/ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });

    const name = `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`;

    const [result] = await client.processDocument({
      name,
      rawDocument: {
        content: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype || 'image/png',
      },
    });

    const doc = result.document || {};
    const fullText = doc.text || '';

    // 取表格 rows
    const tables = [];
    (doc.pages || []).forEach((p, pi) => {
      (p.tables || []).forEach((tb, ti) => {
        const rows = [];
        const collect = (rowObjs=[]) => rowObjs.forEach(r => {
          const cells = (r.cells || []).map(c => {
            let t = '';
            (c.layout?.textAnchor?.textSegments || []).forEach(seg => {
              const s = parseInt(seg.startIndex || '0', 10);
              const e = parseInt(seg.endIndex   || '0', 10);
              t += fullText.substring(s, e);
            });
            return t.replace(/\s+/g, ' ').trim();
          });
          rows.push(cells);
        });
        collect(tb.headerRows); collect(tb.bodyRows);
        tables.push({ page: pi + 1, index: ti, rows });
      });
    });

    // 簡單欄位建議
    const fieldsSuggested = {};
    const put = (k,v)=>{ if (k && v && !fieldsSuggested[k]) fieldsSuggested[k] = v; };
    const kvMap = [
      { re: /(total\s*)?cholesterol|總膽固醇|血清總膽固醇/i, key: '總膽固醇' },
      { re: /triglyceride|三酸甘油|中性脂肪/i,            key: '三酸甘油脂' },
      { re: /hdl(?:\s*cholesterol)?|高密度膽固醇/i,       key: 'HDL' },
      { re: /ldl(?:\s*cholesterol)?|低密度膽固醇/i,       key: 'LDL' },
      { re: /blood pressure|bp|收縮壓|舒張壓|血壓/i,       key: '血壓' },
      { re: /glucose|血糖|fpg|ppg/i,                       key: '血糖' },
      { re: /身高|height/i,                                key: '身高' },
      { re: /體重|weight/i,                                key: '體重' },
      { re: /脈搏|心率|pulse|hr/i,                         key: '脈搏' },
    ];
    const valRe = /([<>]?\s*\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?(?:\s*\/\s*\d+(?:\.\d+)?)?)\s*(mg\/?d[l1i]|mmHg|bpm|%|mmol\/?L|kg|cm|\/min)?/i;

    tables.forEach(tb => tb.rows.forEach(cols => {
      const line = cols.join(' ').trim();
      kvMap.forEach(({re,key})=>{
        if (re.test(line)) {
          const m = line.match(valRe);
          if (m) {
            const v = m[1].replace(/\s+/g,'');
            let u = (m[2]||'').replace(/mg\/?dl/i,'mg/dL');
            if (!u && /血壓|bp/i.test(key)) u = 'mmHg';
            put(key, u ? `${v} ${u}` : v);
          }
        }
      });
    }));

    res.json({ text: fullText, tables, fieldsSuggested });
  } catch (e) {
    console.error('DocAI error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;

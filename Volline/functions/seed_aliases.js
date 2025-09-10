// seed_aliases.js
const admin = require('firebase-admin');
const path = require('path');

// 1) 建議先在本機/Cloud Shell 設好 ADC (Application Default Credentials)
//    gcloud auth application-default login
admin.initializeApp({ credential: admin.credential.applicationDefault() });

const db = admin.firestore();

// 從 normalizer 匯入同一份 SEED，避免重複維護
const { __SEED_FOR_SEEDING: SEED } = require('./functions/normalizer.js');

function keyIdForFirestore(stdKey){ return String(stdKey).replace(/\//g,'__'); }

(async () => {
  const col = db.collection('key_alias');
  let batch = db.batch();
  let i = 0;

  for (const [std, aliases] of Object.entries(SEED)) {
    const docId = keyIdForFirestore(std);
    const ref = col.doc(docId);
    batch.set(ref, {
      aliases,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    i++;
    // Firestore 每批 500，保守一點 400
    if (i % 400 === 0) { await batch.commit(); console.log('Seeded:', i); batch = db.batch(); }
  }

  await batch.commit();
  console.log('All seeded. Total keys:', i);
  process.exit(0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});

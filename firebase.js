const admin = require('firebase-admin');
const serviceAccount = require('./firebaseKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://medwell-test1.firebaseio.com'
    // ⚠️ 暫時不使用 storageBucket
  });
}

const db = admin.firestore();
// ⚠️ 不使用 Storage
// const bucket = admin.storage().bucket();

module.exports = { admin, db }; // 不輸出 bucket

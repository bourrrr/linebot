// firebase.js
const admin = require('firebase-admin');
const serviceAccount = require('./firebaseKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://medwell-test1.firebaseio.com',
    storageBucket: 'medwell-test1.appspot.com' // ✅ 正確 bucket 名稱
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket(); // ✅ 注意：不能在這行上面用 bucket 變數

console.log('✅ Firebase 初始化完成！');
console.log('🔥 Bucket name 檢查:', bucket.name);

module.exports = { admin, db, bucket };

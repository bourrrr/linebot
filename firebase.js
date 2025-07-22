const admin = require('firebase-admin');
const serviceAccount = require('./firebaseKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://medwell-test1.firebaseio.com',
    storageBucket: 'medwell-test1.appspot.com' // ✅ 務必正確寫入
  });
}
console.log('🔥 Bucket name 檢查:', bucket.name);

const db = admin.firestore();
const bucket = admin.storage().bucket(); // ✅ 用 admin.storage()

console.log('✅ Firebase 初始化完成！Bucket:', bucket.name);

module.exports = { admin, db, bucket };

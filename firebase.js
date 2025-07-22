// firebase.js
const admin = require('firebase-admin');
const { getStorage } = require('firebase-admin/storage');
const serviceAccount = require('./firebaseKey.json');

// 避免重複初始化
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://medwell-test1.firebaseio.com',
    storageBucket: 'medwell-test1.appspot.com'  // ✅ 記得加這個
  });
}

// 確保 bucket 成功設定
const bucket = getStorage().bucket(); // ✅ 不用再指定名稱，前面初始化已指定
const db = admin.firestore();

// 除錯資訊（可選）
console.log('✅ Firebase 初始化完成！');
console.log('🔥 使用的 bucket:', bucket.name);

module.exports = { admin, db, bucket };

const admin = require('firebase-admin');
const serviceAccount = require('./firebaseKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://medwell-test1.firebaseio.com',
    storageBucket: 'medwell-test1.appspot.com' // 務必一致
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket(); // ✅ 正確方式

module.exports = { admin, db, bucket };

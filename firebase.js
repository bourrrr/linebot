// firebase.js
const admin = require('firebase-admin');
const { getStorage } = require('firebase-admin/storage');
const serviceAccount = require('./firebaseKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://medwell-test1.firebaseio.com',
    storageBucket: 'medwell-test1.appspot.com'
  });
}
const _bucket_test = admin.app().options.storageBucket;
console.log('BUCKET-TEST:', _bucket_test);
console.log('⚡️ after admin.initializeApp');
console.log('App options:', admin.app().options);
console.log('Storage bucket set:', admin.app().options.storageBucket);
const db = admin.firestore();
const bucket = getStorage().bucket('medwell-test1.appspot.com'); // <-- 強制指定

module.exports = { admin, db, bucket };

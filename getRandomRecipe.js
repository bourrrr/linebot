const admin = require('firebase-admin');

// 避免重複初始化 Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('./firebaseKey.json')),
  });
}

const db = admin.firestore();

function getRandomRecipe() {
  return db.collection('recipes').get().then((snapshot) => {
    const docs = snapshot.docs;
    if (docs.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * docs.length);
    return docs[randomIndex].data();
  });
}

module.exports = getRandomRecipe;

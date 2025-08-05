// getRecipe.js
const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
   credential: admin.credential.cert(require('/etc/secrets/firebaseKey.json'))

  });
}
const db = admin.firestore();

async function getAllRecipes() {
  const snapshot = await db.collection('recipes').get();
  if (snapshot.empty) return [];

  return snapshot.docs.map(doc => doc.data());
}

module.exports = getAllRecipes;

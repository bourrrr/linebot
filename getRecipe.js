// getRecipe.js
const admin = require('firebase-admin');

// Firestore 初始化（只初始化一次，避免重複）
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require('./firebaseKey.json'))
  });
}
const db = admin.firestore();

// 查詢指定食譜名稱
async function getRecipeByName(name) {
  try {
    const snapshot = await db.collection('recipes')
      .where('name', '==', name)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const data = snapshot.docs[0].data();
    const formatted =
      `📌 食譜：${data.name}\n` +
      `💡 小提示：${data.hint}\n\n` +
      `🍽️ 材料：\n${data.ingredients.join('\n')}\n\n` +
      `👣 步驟：\n${data.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    return formatted;
  } catch (err) {
    console.error('讀取食譜錯誤：', err);
    throw err;
  }
}

module.exports = { getRecipeByName };

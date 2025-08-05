const getRandomRecipe = require('../../getRandomRecipe');
const generateRecipeFlex = require('../../generateRecipeFlex');

async function handleRecipeRecommendation(event, client) {
  try {
    const recipe = await getRandomRecipe();
    if (!recipe) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '目前沒有食譜資料喔～'
      });
    }
    const flex = generateRecipeFlex(recipe);
    return client.replyMessage(event.replyToken, flex);
  } catch (err) {
    console.error('❌ 食譜錯誤：', err);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '推薦失敗，請稍後再試！'
    });
  }
}

module.exports = handleRecipeRecommendation;

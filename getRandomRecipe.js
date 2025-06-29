const getAllRecipes = require('./getRecipe');


async function getRandomRecipe() {
  const recipes = await getAllRecipes();
  if (!recipes || recipes.length === 0) return null;
  console.log('📋 所有食譜資料：', recipes);
  const index = Math.floor(Math.random() * recipes.length);
  return recipes[index];
}

module.exports = getRandomRecipe;

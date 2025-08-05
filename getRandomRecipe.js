const getAllRecipes = require('./getRecipe');


async function getRandomRecipe() {
  const recipes = await getAllRecipes();
  if (!recipes || recipes.length === 0) return null;
  const index = Math.floor(Math.random() * recipes.length);
  return recipes[index];
}

module.exports = getRandomRecipe;

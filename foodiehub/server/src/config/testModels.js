
const models = require('../models');

console.log('FoodieHub models loaded successfully!');

Object.keys(models).forEach((modelName) => {
  console.log(`- ${modelName}`);
});

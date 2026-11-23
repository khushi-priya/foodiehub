const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('InventoryRecipeIngredient', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  recipeId: { type: DataTypes.UUID, allowNull: false, field: 'recipe_id' },
  inventoryItemId: { type: DataTypes.UUID, allowNull: false, field: 'inventory_item_id' },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
}, { tableName: 'inventory_recipe_ingredients' });

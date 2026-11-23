const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('InventoryRecipe', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id' },
  menuItemId: { type: DataTypes.UUID, allowNull: false, field: 'menu_item_id' },
  yieldQuantity: { type: DataTypes.DECIMAL(8, 3), allowNull: false, defaultValue: 1, field: 'yield_quantity' },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
}, { tableName: 'inventory_recipes', indexes: [{ unique: true, fields: ['restaurant_id', 'branch_id', 'menu_item_id'], name: 'inventory_recipe_menu_branch_uq' }] });

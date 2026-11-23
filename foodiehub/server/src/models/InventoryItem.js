const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('InventoryItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id' },
  name: { type: DataTypes.STRING(150), allowNull: false },
  sku: { type: DataTypes.STRING(60), allowNull: false },
  unit: { type: DataTypes.STRING(24), allowNull: false },
  quantityOnHand: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0, field: 'quantity_on_hand' },
  reorderLevel: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0, field: 'reorder_level' },
  unitCost: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0, field: 'unit_cost' },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
}, { tableName: 'inventory_items', indexes: [{ unique: true, fields: ['branch_id', 'sku'], name: 'inventory_items_branch_sku_uq' }] });

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('InventoryPurchaseOrderItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  purchaseOrderId: { type: DataTypes.UUID, allowNull: false, field: 'purchase_order_id' },
  inventoryItemId: { type: DataTypes.UUID, allowNull: false, field: 'inventory_item_id' },
  quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
  unitCost: { type: DataTypes.DECIMAL(12, 4), allowNull: false, field: 'unit_cost' },
  lineTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, field: 'line_total' },
}, { tableName: 'inventory_purchase_order_items' });

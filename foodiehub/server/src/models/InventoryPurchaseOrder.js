const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('InventoryPurchaseOrder', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id' },
  supplierId: { type: DataTypes.UUID, allowNull: false, field: 'supplier_id' },
  reference: { type: DataTypes.STRING(60), allowNull: false },
  status: { type: DataTypes.ENUM('draft', 'ordered', 'received', 'cancelled'), allowNull: false, defaultValue: 'draft' },
  totalAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0, field: 'total_amount' },
  orderedAt: { type: DataTypes.DATE, allowNull: true, field: 'ordered_at' },
  receivedAt: { type: DataTypes.DATE, allowNull: true, field: 'received_at' },
  createdByUserId: { type: DataTypes.UUID, allowNull: true, field: 'created_by_user_id' },
}, { tableName: 'inventory_purchase_orders', indexes: [{ unique: true, fields: ['restaurant_id', 'branch_id', 'reference'], name: 'inventory_po_reference_uq' }] });

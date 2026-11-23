const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('InventoryMovement', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id' },
  inventoryItemId: { type: DataTypes.UUID, allowNull: false, field: 'inventory_item_id' },
  movementType: { type: DataTypes.ENUM('opening', 'adjustment_in', 'adjustment_out', 'wastage', 'purchase_receipt', 'order_deduction'), allowNull: false, field: 'movement_type' },
  quantityChange: { type: DataTypes.DECIMAL(12, 3), allowNull: false, field: 'quantity_change' },
  quantityAfter: { type: DataTypes.DECIMAL(12, 3), allowNull: false, field: 'quantity_after' },
  idempotencyKey: { type: DataTypes.STRING(120), allowNull: false, field: 'idempotency_key' },
  note: { type: DataTypes.STRING(500), allowNull: true },
  actorUserId: { type: DataTypes.UUID, allowNull: true, field: 'actor_user_id' },
  createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
}, { tableName: 'inventory_movements', timestamps: false, createdAt: 'createdAt', updatedAt: false });

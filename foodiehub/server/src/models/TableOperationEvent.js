const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('TableOperationEvent', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id', references: { model: 'restaurants', key: 'id' } },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id', references: { model: 'branches', key: 'id' } },
  tableId: { type: DataTypes.UUID, allowNull: false, field: 'table_id', references: { model: 'restaurant_tables', key: 'id' } },
  relatedTableId: { type: DataTypes.UUID, allowNull: true, field: 'related_table_id', references: { model: 'restaurant_tables', key: 'id' } },
  orderId: { type: DataTypes.UUID, allowNull: true, field: 'order_id', references: { model: 'orders', key: 'id' } },
  actorMemberId: { type: DataTypes.UUID, allowNull: false, field: 'actor_member_id', references: { model: 'restaurant_members', key: 'id' } },
  operation: { type: DataTypes.ENUM('transfer', 'merge', 'split', 'status', 'waiter_assignment'), allowNull: false },
  metadata: { type: DataTypes.JSON, allowNull: true },
}, {
  tableName: 'table_operation_events',
  indexes: [{ fields: ['restaurant_id', 'branch_id', 'created_at'], name: 'table_operations_branch_created_idx' }, { fields: ['order_id', 'created_at'], name: 'table_operations_order_created_idx' }],
});

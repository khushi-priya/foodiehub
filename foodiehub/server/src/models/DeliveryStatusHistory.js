const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('DeliveryStatusHistory', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id', references: { model: 'restaurants', key: 'id' } },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id', references: { model: 'branches', key: 'id' } },
  orderId: { type: DataTypes.UUID, allowNull: false, field: 'order_id', references: { model: 'orders', key: 'id' } },
  assignmentId: { type: DataTypes.UUID, allowNull: true, field: 'assignment_id', references: { model: 'delivery_assignments', key: 'id' } },
  restaurantMemberId: { type: DataTypes.UUID, allowNull: true, field: 'restaurant_member_id', references: { model: 'restaurant_members', key: 'id' } },
  performedByUserId: { type: DataTypes.UUID, allowNull: false, field: 'performed_by_user_id', references: { model: 'users', key: 'id' } },
  event: { type: DataTypes.STRING(80), allowNull: false },
  fromStatus: { type: DataTypes.STRING(40), allowNull: true, field: 'from_status' },
  toStatus: { type: DataTypes.STRING(40), allowNull: false, field: 'to_status' },
  notes: { type: DataTypes.STRING(1000), allowNull: true },
}, { tableName: 'delivery_status_history', indexes: [{ fields: ['restaurant_id', 'order_id', 'created_at'] }, { fields: ['assignment_id', 'created_at'] }] });

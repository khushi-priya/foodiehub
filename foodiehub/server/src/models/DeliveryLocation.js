const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('DeliveryLocation', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id', references: { model: 'restaurants', key: 'id' } },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id', references: { model: 'branches', key: 'id' } },
  orderId: { type: DataTypes.UUID, allowNull: false, field: 'order_id', references: { model: 'orders', key: 'id' } },
  assignmentId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'assignment_id', references: { model: 'delivery_assignments', key: 'id' } },
  restaurantMemberId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_member_id', references: { model: 'restaurant_members', key: 'id' } },
  latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
  longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
  accuracyMeters: { type: DataTypes.DECIMAL(9, 2), allowNull: true, field: 'accuracy_meters' },
  capturedAt: { type: DataTypes.DATE, allowNull: false, field: 'captured_at' },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
}, { tableName: 'delivery_locations', indexes: [{ fields: ['restaurant_id', 'branch_id', 'expires_at'] }, { fields: ['order_id', 'expires_at'] }] });

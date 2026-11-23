const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('DeliveryAssignment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id', references: { model: 'restaurants', key: 'id' } },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id', references: { model: 'branches', key: 'id' } },
  orderId: { type: DataTypes.UUID, allowNull: false, field: 'order_id', references: { model: 'orders', key: 'id' } },
  restaurantMemberId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_member_id', references: { model: 'restaurant_members', key: 'id' } },
  assignedByUserId: { type: DataTypes.UUID, allowNull: false, field: 'assigned_by_user_id', references: { model: 'users', key: 'id' } },
  status: { type: DataTypes.ENUM('pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant', 'rejected', 'timed_out', 'picked_up', 'on_the_way', 'at_customer', 'delivered', 'failed', 'cancelled', 'reassigned'), allowNull: false, defaultValue: 'pending_acceptance' },
  assignedAt: { type: DataTypes.DATE, allowNull: false, field: 'assigned_at' },
  acceptedAt: { type: DataTypes.DATE, allowNull: true, field: 'accepted_at' },
  completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
  notes: { type: DataTypes.STRING(1000), allowNull: true },
}, { tableName: 'delivery_assignments', indexes: [{ fields: ['restaurant_id', 'branch_id', 'status'] }, { fields: ['restaurant_member_id', 'status'] }, { fields: ['order_id', 'created_at'] }] });

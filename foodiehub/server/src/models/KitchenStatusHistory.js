'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('KitchenStatusHistory', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id' },
  orderId: { type: DataTypes.UUID, allowNull: false, field: 'order_id' },
  fromStatus: { type: DataTypes.STRING(30), allowNull: true, field: 'from_status' },
  toStatus: { type: DataTypes.ENUM('queued', 'preparing', 'ready', 'handed_over'), allowNull: false, field: 'to_status' },
  performedByUserId: { type: DataTypes.UUID, allowNull: false, field: 'performed_by_user_id' },
  notes: { type: DataTypes.STRING(1000), allowNull: true },
}, { tableName: 'kitchen_status_history', underscored: true, indexes: [{ fields: ['restaurant_id', 'order_id', 'created_at'] }, { fields: ['branch_id', 'to_status', 'created_at'] }] });

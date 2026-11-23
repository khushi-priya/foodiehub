'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('OrderRefund', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  orderId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'order_id', references: { model: 'orders', key: 'id' } },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id', references: { model: 'restaurants', key: 'id' } },
  requestedByUserId: { type: DataTypes.UUID, allowNull: false, field: 'requested_by_user_id', references: { model: 'users', key: 'id' } },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  reason: { type: DataTypes.STRING(1000), allowNull: false },
  status: { type: DataTypes.ENUM('requested', 'pending', 'processed', 'failed', 'unknown'), allowNull: false, defaultValue: 'requested' },
  razorpayRefundId: { type: DataTypes.STRING(80), allowNull: true, unique: true, field: 'razorpay_refund_id' },
  providerStatus: { type: DataTypes.STRING(40), allowNull: true, field: 'provider_status' },
  failureCode: { type: DataTypes.STRING(100), allowNull: true, field: 'failure_code' },
  processedAt: { type: DataTypes.DATE, allowNull: true, field: 'processed_at' },
}, {
  tableName: 'order_refunds',
  indexes: [{ fields: ['restaurant_id', 'created_at'], name: 'order_refunds_restaurant_created_idx' }],
});

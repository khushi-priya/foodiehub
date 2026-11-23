'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('OrderPaymentAttempt', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  orderId: { type: DataTypes.UUID, allowNull: false, field: 'order_id' },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: true, field: 'branch_id' },
  gateway: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'razorpay' },
  gatewayOrderId: { type: DataTypes.STRING(80), allowNull: false, unique: true, field: 'gateway_order_id' },
  gatewayPaymentId: { type: DataTypes.STRING(80), allowNull: true, unique: true, field: 'gateway_payment_id' },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
  status: { type: DataTypes.ENUM('pending', 'authorized', 'captured', 'failed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
  failureCode: { type: DataTypes.STRING(100), allowNull: true, field: 'failure_code' },
  failureDescription: { type: DataTypes.STRING(500), allowNull: true, field: 'failure_description' },
  capturedAt: { type: DataTypes.DATE, allowNull: true, field: 'captured_at' },
}, { tableName: 'order_payment_attempts', underscored: true, indexes: [{ fields: ['order_id', 'created_at'] }, { fields: ['restaurant_id', 'status', 'created_at'] }] });

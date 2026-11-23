'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('PosTender', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  orderId: { type: DataTypes.UUID, allowNull: false, field: 'order_id' },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id' },
  createdByUserId: { type: DataTypes.UUID, allowNull: false, field: 'created_by_user_id' },
  idempotencyKey: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'idempotency_key' },
  method: { type: DataTypes.ENUM('cash', 'razorpay'), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'paid', 'failed'), allowNull: false, defaultValue: 'pending' },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  razorpayOrderId: { type: DataTypes.STRING(80), allowNull: true, unique: true, field: 'razorpay_order_id' },
  razorpayPaymentId: { type: DataTypes.STRING(80), allowNull: true, unique: true, field: 'razorpay_payment_id' },
  reference: { type: DataTypes.STRING(120), allowNull: true },
}, { tableName: 'pos_tenders', indexes: [{ fields: ['order_id', 'status'] }, { fields: ['restaurant_id', 'branch_id', 'created_at'] }] });

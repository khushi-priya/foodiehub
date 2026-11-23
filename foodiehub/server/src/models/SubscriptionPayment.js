const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('SubscriptionPayment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  subscriptionId: { type: DataTypes.UUID, allowNull: false, field: 'subscription_id' },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  planId: { type: DataTypes.UUID, allowNull: false, field: 'plan_id' },
  planSnapshot: { type: DataTypes.JSON, allowNull: false, field: 'plan_snapshot' },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
  status: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'), allowNull: false, defaultValue: 'pending' },
  paymentType: { type: DataTypes.ENUM('initial', 'renewal', 'plan_change'), allowNull: false, field: 'payment_type' },
  razorpayOrderId: { type: DataTypes.STRING(80), allowNull: true, unique: true, field: 'razorpay_order_id' },
  razorpayPaymentId: { type: DataTypes.STRING(80), allowNull: true, unique: true, field: 'razorpay_payment_id' },
  idempotencyKey: { type: DataTypes.UUID, allowNull: false, field: 'idempotency_key' },
  periodStartAt: { type: DataTypes.DATE, allowNull: false, field: 'period_start_at' },
  periodEndAt: { type: DataTypes.DATE, allowNull: false, field: 'period_end_at' },
  verifiedAt: { type: DataTypes.DATE, allowNull: true, field: 'verified_at' },
  failureReason: { type: DataTypes.TEXT, allowNull: true, field: 'failure_reason' },
}, { tableName: 'subscription_payments', indexes: [{ unique: true, fields: ['restaurant_id', 'idempotency_key'], name: 'subscription_payments_restaurant_idempotency_uq' }, { fields: ['restaurant_id', 'created_at'] }, { fields: ['subscription_id', 'created_at'] }, { fields: ['status', 'created_at'] }] });

'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('RazorpayWebhookEvent', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  eventId: { type: DataTypes.STRING(100), allowNull: false, unique: true, field: 'event_id' },
  eventType: { type: DataTypes.STRING(80), allowNull: false, field: 'event_type' },
  gatewayOrderId: { type: DataTypes.STRING(80), allowNull: true, field: 'gateway_order_id' },
  gatewayPaymentId: { type: DataTypes.STRING(80), allowNull: true, field: 'gateway_payment_id' },
  status: { type: DataTypes.ENUM('processing', 'processed', 'failed', 'ignored'), allowNull: false, defaultValue: 'processing' },
  result: { type: DataTypes.STRING(500), allowNull: true },
  processedAt: { type: DataTypes.DATE, allowNull: true, field: 'processed_at' },
}, { tableName: 'razorpay_webhook_events', underscored: true, indexes: [{ fields: ['event_type', 'created_at'] }, { fields: ['gateway_order_id'] }] });

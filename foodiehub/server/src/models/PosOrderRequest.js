'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('PosOrderRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id' },
  idempotencyKey: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'idempotency_key' },
  requestHash: { type: DataTypes.STRING(64), allowNull: false, field: 'request_hash' },
  orderId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'order_id' },
}, { tableName: 'pos_order_requests' });

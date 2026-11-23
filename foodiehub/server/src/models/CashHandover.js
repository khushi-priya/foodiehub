'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CashHandover', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id' },
  restaurantMemberId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_member_id' },
  expectedAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'expected_amount' },
  submittedAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'submitted_amount' },
  receivedAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'received_amount' },
  status: { type: DataTypes.ENUM('pending', 'confirmed', 'disputed'), allowNull: false, defaultValue: 'pending' },
  idempotencyKey: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'idempotency_key' },
  submittedAt: { type: DataTypes.DATE, allowNull: false, field: 'submitted_at' },
  receivedAt: { type: DataTypes.DATE, allowNull: true, field: 'received_at' },
  receivedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'received_by_user_id' },
  notes: { type: DataTypes.STRING(1000), allowNull: true },
}, { tableName: 'cash_handovers', underscored: true, indexes: [{ fields: ['restaurant_id', 'branch_id', 'status', 'submitted_at'] }, { fields: ['restaurant_member_id', 'submitted_at'] }] });

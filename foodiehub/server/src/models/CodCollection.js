'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CodCollection', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  orderId: { type: DataTypes.UUID, allowNull: false, field: 'order_id' },
  assignmentId: { type: DataTypes.UUID, allowNull: false, field: 'assignment_id' },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id' },
  restaurantMemberId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_member_id' },
  expectedAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'expected_amount' },
  collectedAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'collected_amount' },
  status: { type: DataTypes.ENUM('awaiting_collection', 'collected', 'collection_failed', 'disputed', 'reconciled'), allowNull: false, defaultValue: 'awaiting_collection' },
  resolutionStatus: { type: DataTypes.ENUM('unresolved', 'resolved'), allowNull: false, defaultValue: 'unresolved', field: 'resolution_status' },
  resolutionReason: { type: DataTypes.STRING(1000), allowNull: true, field: 'resolution_reason' },
  resolvedByUserId: { type: DataTypes.UUID, allowNull: true, field: 'resolved_by_user_id' },
  resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
  reason: { type: DataTypes.STRING(1000), allowNull: true },
  requestKey: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'request_key' },
  collectedAt: { type: DataTypes.DATE, allowNull: true, field: 'collected_at' },
}, { tableName: 'cod_collections', underscored: true, indexes: [{ fields: ['restaurant_id', 'branch_id', 'status', 'created_at'] }, { fields: ['restaurant_member_id', 'status', 'created_at'] }, { fields: ['order_id', 'created_at'] }] });

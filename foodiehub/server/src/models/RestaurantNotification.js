'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('RestaurantNotification', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id', references: { model: 'restaurants', key: 'id' } },
  branchId: { type: DataTypes.UUID, allowNull: true, field: 'branch_id', references: { model: 'branches', key: 'id' } },
  restaurantMemberId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_member_id', references: { model: 'restaurant_members', key: 'id' } },
  category: { type: DataTypes.ENUM('orders', 'kitchen', 'reservations', 'delivery', 'payments', 'staff', 'branch'), allowNull: false },
  title: { type: DataTypes.STRING(150), allowNull: false },
  message: { type: DataTypes.STRING(500), allowNull: false },
  href: { type: DataTypes.STRING(255), allowNull: true },
  entityId: { type: DataTypes.STRING(80), allowNull: true, field: 'entity_id' },
  dedupeKey: { type: DataTypes.STRING(180), allowNull: true, field: 'dedupe_key' },
  readAt: { type: DataTypes.DATE, allowNull: true, field: 'read_at' },
}, { tableName: 'restaurant_notifications', indexes: [{ fields: ['restaurant_id', 'restaurant_member_id', 'read_at', 'created_at'], name: 'restaurant_notifications_inbox_idx' }, { unique: true, fields: ['restaurant_member_id', 'dedupe_key'], name: 'restaurant_notifications_dedupe_idx' }, { fields: ['branch_id', 'created_at'], name: 'restaurant_notifications_branch_idx' }] });

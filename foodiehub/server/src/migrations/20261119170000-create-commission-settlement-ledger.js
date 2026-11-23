'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(q) {
    await q.createTable('commission_rules', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false }, restaurant_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'restaurants', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' }, commission_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false }, effective_from: { type: DataTypes.DATE, allowNull: false }, effective_to: { type: DataTypes.DATE, allowNull: true }, status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' }, created_by: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' }, created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('commission_rules', ['restaurant_id', 'status', 'effective_from'], { name: 'commission_rules_scope_effective_idx' });
    await q.createTable('commission_records', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false }, order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' }, restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' }, branch_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'branches', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' }, rule_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'commission_rules', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' }, record_type: { type: DataTypes.ENUM('accrual', 'refund_adjustment'), allowNull: false, defaultValue: 'accrual' }, adjusts_record_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'commission_records', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' }, eligible_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, commission_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false }, commission_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, restaurant_payable: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, status: { type: DataTypes.ENUM('pending', 'settled', 'reversed'), allowNull: false, defaultValue: 'pending' }, transaction_at: { type: DataTypes.DATE, allowNull: false }, created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('commission_records', ['order_id', 'record_type'], { unique: true, name: 'commission_records_order_type_uq' });
    await q.addIndex('commission_records', ['restaurant_id', 'status', 'transaction_at'], { name: 'commission_records_restaurant_status_date_idx' });
    await q.createTable('commission_settlements', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false }, restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' }, amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' }, transaction_reference: { type: DataTypes.STRING(160), allowNull: false, unique: true }, settled_at: { type: DataTypes.DATE, allowNull: false }, status: { type: DataTypes.ENUM('completed'), allowNull: false, defaultValue: 'completed' }, recorded_by: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' }, created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('commission_settlements', ['restaurant_id', 'settled_at'], { name: 'commission_settlement_restaurant_date_idx' });
    await q.createTable('commission_settlement_items', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false }, settlement_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'commission_settlements', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' }, commission_record_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'commission_records', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' }, amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
  },
  async down(q) {
    await q.dropTable('commission_settlement_items'); await q.dropTable('commission_settlements'); await q.dropTable('commission_records'); await q.dropTable('commission_rules');
  },
};

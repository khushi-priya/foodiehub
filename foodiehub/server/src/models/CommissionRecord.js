const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CommissionRecord', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  orderId: { type: DataTypes.UUID, allowNull: false, field: 'order_id' },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: true, field: 'branch_id' },
  ruleId: { type: DataTypes.UUID, allowNull: true, field: 'rule_id' },
  recordType: { type: DataTypes.ENUM('accrual', 'refund_adjustment'), allowNull: false, defaultValue: 'accrual', field: 'record_type' },
  adjustsRecordId: { type: DataTypes.UUID, allowNull: true, field: 'adjusts_record_id' },
  eligibleAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'eligible_amount' },
  commissionRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, field: 'commission_rate' },
  commissionAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'commission_amount' },
  restaurantPayable: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'restaurant_payable' },
  status: { type: DataTypes.ENUM('pending', 'settled', 'reversed'), allowNull: false, defaultValue: 'pending' },
  transactionAt: { type: DataTypes.DATE, allowNull: false, field: 'transaction_at' },
}, { tableName: 'commission_records', underscored: true, indexes: [{ unique: true, fields: ['order_id', 'record_type'] }, { fields: ['restaurant_id', 'status', 'transaction_at'] }] });

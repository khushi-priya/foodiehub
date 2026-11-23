const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CommissionSettlementItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  settlementId: { type: DataTypes.UUID, allowNull: false, field: 'settlement_id' },
  commissionRecordId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'commission_record_id' },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
}, { tableName: 'commission_settlement_items', underscored: true });

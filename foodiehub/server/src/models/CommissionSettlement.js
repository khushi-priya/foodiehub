const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CommissionSettlement', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
  transactionReference: { type: DataTypes.STRING(160), allowNull: false, unique: true, field: 'transaction_reference' },
  settledAt: { type: DataTypes.DATE, allowNull: false, field: 'settled_at' },
  status: { type: DataTypes.ENUM('completed'), allowNull: false, defaultValue: 'completed' },
  recordedBy: { type: DataTypes.UUID, allowNull: true, field: 'recorded_by' },
}, { tableName: 'commission_settlements', underscored: true, indexes: [{ fields: ['restaurant_id', 'settled_at'] }] });

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CommissionRule', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: true, field: 'restaurant_id' },
  commissionRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, field: 'commission_rate', validate: { min: 0, max: 100 } },
  effectiveFrom: { type: DataTypes.DATE, allowNull: false, field: 'effective_from' },
  effectiveTo: { type: DataTypes.DATE, allowNull: true, field: 'effective_to' },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
}, { tableName: 'commission_rules', underscored: true, indexes: [{ fields: ['restaurant_id', 'status', 'effective_from'] }] });

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('SubscriptionPlan', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, validate: { min: 0 } },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
  billingPeriod: { type: DataTypes.ENUM('monthly', 'yearly'), allowNull: false, field: 'billing_period' },
  maxBranches: { type: DataTypes.INTEGER, allowNull: true, field: 'max_branches', validate: { min: 1 } },
  maxEmployees: { type: DataTypes.INTEGER, allowNull: true, field: 'max_employees', validate: { min: 0 } },
  features: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
}, { tableName: 'subscription_plans', indexes: [{ fields: ['is_active', 'billing_period'] }] });

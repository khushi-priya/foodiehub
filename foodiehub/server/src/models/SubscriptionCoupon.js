const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('SubscriptionCoupon', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  code: { type: DataTypes.STRING(40), allowNull: false, unique: true, set(value) { this.setDataValue('code', String(value || '').trim().toUpperCase()); } },
  name: { type: DataTypes.STRING(120), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  appliesTo: { type: DataTypes.ENUM('all', 'first', 'renewal'), allowNull: false, defaultValue: 'all', field: 'applies_to' },
  discountType: { type: DataTypes.ENUM('percentage', 'fixed'), allowNull: false, field: 'discount_type' },
  discountValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'discount_value' },
  maximumDiscount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'maximum_discount' },
  startsAt: { type: DataTypes.DATE, allowNull: false, field: 'starts_at' },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  usageLimit: { type: DataTypes.INTEGER, allowNull: true, field: 'usage_limit' },
  perRestaurantLimit: { type: DataTypes.INTEGER, allowNull: true, field: 'per_restaurant_limit' },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
}, { tableName: 'subscription_coupons', underscored: true, indexes: [{ fields: ['status', 'expires_at'] }, { fields: ['code'], unique: true }] });

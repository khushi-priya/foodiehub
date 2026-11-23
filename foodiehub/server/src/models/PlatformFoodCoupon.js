const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('PlatformFoodCoupon', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  code: { type: DataTypes.STRING(40), allowNull: false, unique: true, set(value) { this.setDataValue('code', String(value || '').trim().toUpperCase()); } },
  name: { type: DataTypes.STRING(120), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  discountType: { type: DataTypes.ENUM('percentage', 'fixed'), allowNull: false, field: 'discount_type' },
  discountValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'discount_value' },
  minimumOrderAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'minimum_order_amount' },
  maximumDiscount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'maximum_discount' },
  startsAt: { type: DataTypes.DATE, allowNull: false, field: 'starts_at' },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  usageLimit: { type: DataTypes.INTEGER, allowNull: true, field: 'usage_limit' },
  perCustomerLimit: { type: DataTypes.INTEGER, allowNull: true, field: 'per_customer_limit' },
  restaurantIds: { type: DataTypes.JSON, allowNull: true, field: 'restaurant_ids' },
  categoryIds: { type: DataTypes.JSON, allowNull: true, field: 'category_ids' },
  productIds: { type: DataTypes.JSON, allowNull: true, field: 'product_ids' },
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
}, { tableName: 'platform_food_coupons', underscored: true, indexes: [{ fields: ['status', 'expires_at'] }, { fields: ['code'], unique: true }] });

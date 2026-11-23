const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('RestaurantFoodCoupon', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  code: { type: DataTypes.STRING(40), allowNull: false, set(value) { this.setDataValue('code', String(value || '').trim().toUpperCase()); } },
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
  status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
}, { tableName: 'restaurant_food_coupons', underscored: true, indexes: [{ unique: true, fields: ['restaurant_id', 'code'], name: 'restaurant_food_coupons_restaurant_code_uq' }, { fields: ['restaurant_id', 'status', 'expires_at'], name: 'restaurant_food_coupons_status_expiry_idx' }] });

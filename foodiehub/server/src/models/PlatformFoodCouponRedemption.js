const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('PlatformFoodCouponRedemption', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  couponId: { type: DataTypes.UUID, allowNull: false, field: 'coupon_id' },
  customerId: { type: DataTypes.UUID, allowNull: false, field: 'customer_id' },
  orderId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'order_id' },
  discountAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'discount_amount' },
  status: { type: DataTypes.ENUM('reserved', 'redeemed', 'released'), allowNull: false, defaultValue: 'reserved' },
}, { tableName: 'platform_food_coupon_redemptions', underscored: true, indexes: [{ fields: ['coupon_id', 'customer_id', 'status'] }] });

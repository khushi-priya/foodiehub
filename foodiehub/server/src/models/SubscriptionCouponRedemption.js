const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('SubscriptionCouponRedemption', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  couponId: { type: DataTypes.UUID, allowNull: false, field: 'coupon_id' },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  paymentId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'payment_id' },
  discountAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'discount_amount' },
}, { tableName: 'subscription_coupon_redemptions', underscored: true, indexes: [{ fields: ['coupon_id', 'restaurant_id'] }] });

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('RestaurantFoodCouponRedemption', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  couponId: { type: DataTypes.UUID, allowNull: false, field: 'coupon_id' },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  customerId: { type: DataTypes.UUID, allowNull: false, field: 'customer_id' },
  orderId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'order_id' },
  discountAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'discount_amount' },
  status: { type: DataTypes.ENUM('reserved', 'redeemed', 'released'), allowNull: false, defaultValue: 'reserved' },
}, { tableName: 'restaurant_food_coupon_redemptions', underscored: true, indexes: [{ fields: ['coupon_id', 'customer_id', 'status'], name: 'restaurant_coupon_customer_status_idx' }, { fields: ['restaurant_id', 'created_at'], name: 'restaurant_coupon_restaurant_created_idx' }] });

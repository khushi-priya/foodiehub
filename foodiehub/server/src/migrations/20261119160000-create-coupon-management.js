'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(q) {
    await q.addColumn('orders', 'coupon_code', { type: DataTypes.STRING(40), allowNull: true });
    await q.createTable('platform_food_coupons', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      code: { type: DataTypes.STRING(40), allowNull: false, unique: true }, name: { type: DataTypes.STRING(120), allowNull: false }, description: { type: DataTypes.TEXT, allowNull: true },
      discount_type: { type: DataTypes.ENUM('percentage', 'fixed'), allowNull: false }, discount_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, minimum_order_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }, maximum_discount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      starts_at: { type: DataTypes.DATE, allowNull: false }, expires_at: { type: DataTypes.DATE, allowNull: false }, usage_limit: { type: DataTypes.INTEGER, allowNull: true }, per_customer_limit: { type: DataTypes.INTEGER, allowNull: true }, restaurant_ids: { type: DataTypes.JSON, allowNull: true }, category_ids: { type: DataTypes.JSON, allowNull: true }, product_ids: { type: DataTypes.JSON, allowNull: true },
      status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' }, created_by: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' }, created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('platform_food_coupons', ['status', 'expires_at'], { name: 'platform_food_coupons_status_expiry_idx' });
    await q.createTable('platform_food_coupon_redemptions', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false }, coupon_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'platform_food_coupons', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' }, customer_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' }, order_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'orders', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' }, discount_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, status: { type: DataTypes.ENUM('reserved', 'redeemed', 'released'), allowNull: false, defaultValue: 'reserved' }, created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('platform_food_coupon_redemptions', ['coupon_id', 'customer_id', 'status'], { name: 'platform_food_coupon_customer_status_idx' });
    await q.createTable('subscription_coupons', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false }, code: { type: DataTypes.STRING(40), allowNull: false, unique: true }, name: { type: DataTypes.STRING(120), allowNull: false }, description: { type: DataTypes.TEXT, allowNull: true }, applies_to: { type: DataTypes.ENUM('all', 'first', 'renewal'), allowNull: false, defaultValue: 'all' }, discount_type: { type: DataTypes.ENUM('percentage', 'fixed'), allowNull: false }, discount_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, maximum_discount: { type: DataTypes.DECIMAL(12, 2), allowNull: true }, starts_at: { type: DataTypes.DATE, allowNull: false }, expires_at: { type: DataTypes.DATE, allowNull: false }, usage_limit: { type: DataTypes.INTEGER, allowNull: true }, per_restaurant_limit: { type: DataTypes.INTEGER, allowNull: true }, status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' }, created_by: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' }, created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('subscription_coupons', ['status', 'expires_at'], { name: 'subscription_coupons_status_expiry_idx' });
    await q.createTable('subscription_coupon_redemptions', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false }, coupon_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'subscription_coupons', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' }, restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' }, payment_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'subscription_payments', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' }, discount_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('subscription_coupon_redemptions', ['coupon_id', 'restaurant_id'], { name: 'subscription_coupon_restaurant_idx' });
  },
  async down(q) {
    await q.dropTable('subscription_coupon_redemptions'); await q.dropTable('subscription_coupons'); await q.dropTable('platform_food_coupon_redemptions'); await q.dropTable('platform_food_coupons'); await q.removeColumn('orders', 'coupon_code');
  },
};

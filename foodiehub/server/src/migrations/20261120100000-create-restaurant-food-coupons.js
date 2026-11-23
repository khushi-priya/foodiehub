'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(q) {
    await q.createTable('restaurant_food_coupons', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      code: { type: DataTypes.STRING(40), allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false }, description: { type: DataTypes.TEXT, allowNull: true },
      discount_type: { type: DataTypes.ENUM('percentage', 'fixed'), allowNull: false }, discount_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, minimum_order_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }, maximum_discount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      starts_at: { type: DataTypes.DATE, allowNull: false }, expires_at: { type: DataTypes.DATE, allowNull: false }, usage_limit: { type: DataTypes.INTEGER, allowNull: true }, per_customer_limit: { type: DataTypes.INTEGER, allowNull: true },
      status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' }, created_by: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('restaurant_food_coupons', ['restaurant_id', 'code'], { unique: true, name: 'restaurant_food_coupons_restaurant_code_uq' });
    await q.addIndex('restaurant_food_coupons', ['restaurant_id', 'status', 'expires_at'], { name: 'restaurant_food_coupons_status_expiry_idx' });
    await q.createTable('restaurant_food_coupon_redemptions', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      coupon_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_food_coupons', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      customer_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      order_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'orders', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      discount_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, status: { type: DataTypes.ENUM('reserved', 'redeemed', 'released'), allowNull: false, defaultValue: 'reserved' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('restaurant_food_coupon_redemptions', ['coupon_id', 'customer_id', 'status'], { name: 'restaurant_coupon_customer_status_idx' });
    await q.addIndex('restaurant_food_coupon_redemptions', ['restaurant_id', 'created_at'], { name: 'restaurant_coupon_restaurant_created_idx' });
    await q.addColumn('orders', 'coupon_source', { type: DataTypes.ENUM('platform_food', 'restaurant_food'), allowNull: true });
  },
  async down(q) {
    await q.removeColumn('orders', 'coupon_source');
    await q.dropTable('restaurant_food_coupon_redemptions');
    await q.dropTable('restaurant_food_coupons');
  },
};

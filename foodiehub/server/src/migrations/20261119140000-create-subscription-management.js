'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('subscription_plans', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      code: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
      billing_period: { type: DataTypes.ENUM('monthly', 'yearly'), allowNull: false },
      max_branches: { type: DataTypes.INTEGER, allowNull: true },
      max_employees: { type: DataTypes.INTEGER, allowNull: true },
      features: { type: DataTypes.JSON, allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('subscription_plans', ['is_active', 'billing_period'], { name: 'subscription_plans_active_period_idx' });

    await queryInterface.createTable('restaurant_subscriptions', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      plan_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'subscription_plans', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      plan_snapshot: { type: DataTypes.JSON, allowNull: false },
      status: { type: DataTypes.ENUM('pending', 'active', 'expired', 'cancelled', 'failed'), allowNull: false, defaultValue: 'pending' },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
      start_date: { type: DataTypes.DATE, allowNull: true },
      end_date: { type: DataTypes.DATE, allowNull: true },
      renewal_date: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('restaurant_subscriptions', ['restaurant_id', 'status'], { name: 'restaurant_subscriptions_restaurant_status_idx' });
    await queryInterface.addIndex('restaurant_subscriptions', ['restaurant_id', 'end_date'], { name: 'restaurant_subscriptions_restaurant_end_idx' });
    await queryInterface.addIndex('restaurant_subscriptions', ['plan_id', 'status'], { name: 'restaurant_subscriptions_plan_status_idx' });

    await queryInterface.createTable('subscription_payments', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      subscription_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_subscriptions', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      plan_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'subscription_plans', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      plan_snapshot: { type: DataTypes.JSON, allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
      status: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'), allowNull: false, defaultValue: 'pending' },
      payment_type: { type: DataTypes.ENUM('initial', 'renewal', 'plan_change'), allowNull: false },
      razorpay_order_id: { type: DataTypes.STRING(80), allowNull: true, unique: true },
      razorpay_payment_id: { type: DataTypes.STRING(80), allowNull: true, unique: true },
      idempotency_key: { type: DataTypes.UUID, allowNull: false },
      period_start_at: { type: DataTypes.DATE, allowNull: false },
      period_end_at: { type: DataTypes.DATE, allowNull: false },
      verified_at: { type: DataTypes.DATE, allowNull: true },
      failure_reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('subscription_payments', ['restaurant_id', 'idempotency_key'], { unique: true, name: 'subscription_payments_restaurant_idempotency_uq' });
    await queryInterface.addIndex('subscription_payments', ['restaurant_id', 'created_at'], { name: 'subscription_payments_restaurant_created_idx' });
    await queryInterface.addIndex('subscription_payments', ['subscription_id', 'created_at'], { name: 'subscription_payments_subscription_created_idx' });
    await queryInterface.addIndex('subscription_payments', ['status', 'created_at'], { name: 'subscription_payments_status_created_idx' });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('subscription_payments');
    await queryInterface.dropTable('restaurant_subscriptions');
    await queryInterface.dropTable('subscription_plans');
  },
};

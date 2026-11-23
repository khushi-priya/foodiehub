'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('customer_carts', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      customer_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.createTable('customer_cart_items', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      cart_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'customer_carts', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      menu_item_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'menu_items', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      variant_option_id: { type: DataTypes.UUID, allowNull: true },
      addon_option_ids: { type: DataTypes.JSON, allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('customer_cart_items', ['cart_id']);
    await queryInterface.addIndex('customer_cart_items', ['menu_item_id']);

    await queryInterface.addColumn('branches', 'cash_on_delivery_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn('orders', 'order_type', { type: DataTypes.ENUM('delivery', 'takeaway', 'dine_in'), allowNull: false, defaultValue: 'delivery' });
    await queryInterface.addColumn('orders', 'idempotency_key', { type: DataTypes.UUID, allowNull: true });
    await queryInterface.addIndex('orders', ['customer_id', 'idempotency_key'], { unique: true, name: 'orders_customer_idempotency_unique' });
    await queryInterface.addColumn('order_items', 'variant_name', { type: DataTypes.STRING(100), allowNull: true });
    await queryInterface.addColumn('order_items', 'addons_snapshot', { type: DataTypes.JSON, allowNull: false, defaultValue: [] });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('order_items', 'addons_snapshot');
    await queryInterface.removeColumn('order_items', 'variant_name');
    await queryInterface.removeIndex('orders', 'orders_customer_idempotency_unique');
    await queryInterface.removeColumn('orders', 'idempotency_key');
    await queryInterface.removeColumn('orders', 'order_type');
    await queryInterface.removeColumn('branches', 'cash_on_delivery_enabled');
    await queryInterface.dropTable('customer_cart_items');
    await queryInterface.dropTable('customer_carts');
  },
};

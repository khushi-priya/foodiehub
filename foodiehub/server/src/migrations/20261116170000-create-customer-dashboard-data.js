'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('orders', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      customer_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      branch_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      order_number: { type: DataTypes.STRING(40), allowNull: false, unique: true },
      status: { type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'preparing', 'ready', 'completed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
      payment_status: { type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'), allowNull: false, defaultValue: 'pending' },
      payment_method: { type: DataTypes.STRING(50), allowNull: true },
      subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      tax: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      delivery_fee: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      discount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      customer_name: { type: DataTypes.STRING(150), allowNull: false }, customer_phone: { type: DataTypes.STRING(20), allowNull: true }, customer_email: { type: DataTypes.STRING(150), allowNull: true },
      delivery_address: { type: DataTypes.TEXT, allowNull: true }, customer_notes: { type: DataTypes.TEXT, allowNull: true }, restaurant_notes: { type: DataTypes.TEXT, allowNull: true },
      accepted_at: { type: DataTypes.DATE, allowNull: true }, completed_at: { type: DataTypes.DATE, allowNull: true }, cancelled_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('orders', ['restaurant_id', 'created_at']);
    await queryInterface.addIndex('orders', ['restaurant_id', 'status']);
    await queryInterface.addIndex('orders', ['customer_id']);
    await queryInterface.createTable('order_items', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      menu_item_id: { type: DataTypes.UUID, allowNull: true },
      item_name: { type: DataTypes.STRING(200), allowNull: false }, item_description: { type: DataTypes.TEXT, allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: false }, unit_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, line_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, item_notes: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('order_items', ['order_id']);
    await queryInterface.addIndex('order_items', ['menu_item_id']);

    await queryInterface.createTable('customer_addresses', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      customer_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      full_name: { type: DataTypes.STRING(150), allowNull: false }, phone: { type: DataTypes.STRING(20), allowNull: false },
      house: { type: DataTypes.STRING(150), allowNull: false }, street: { type: DataTypes.STRING(255), allowNull: false }, landmark: { type: DataTypes.STRING(150), allowNull: true },
      city: { type: DataTypes.STRING(100), allowNull: false }, state: { type: DataTypes.STRING(100), allowNull: false }, postal_code: { type: DataTypes.STRING(20), allowNull: false },
      address_type: { type: DataTypes.ENUM('home', 'work', 'other'), allowNull: false, defaultValue: 'home' }, is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('customer_addresses', ['customer_id']);
    await queryInterface.addIndex('customer_addresses', ['customer_id', 'is_default']);

    await queryInterface.createTable('customer_wishlist_items', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      customer_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      target_type: { type: DataTypes.ENUM('restaurant', 'food'), allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      menu_item_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'menu_items', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('customer_wishlist_items', ['customer_id']);
    await queryInterface.addIndex('customer_wishlist_items', ['customer_id', 'restaurant_id'], { unique: true, name: 'customer_wishlist_restaurant_unique' });
    await queryInterface.addIndex('customer_wishlist_items', ['customer_id', 'menu_item_id'], { unique: true, name: 'customer_wishlist_menu_item_unique' });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('customer_wishlist_items');
    await queryInterface.dropTable('customer_addresses');
    await queryInterface.dropTable('order_items');
    await queryInterface.dropTable('orders');
  },
};

'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.changeColumn('menu_categories', 'restaurant_id', {
      type: DataTypes.UUID, allowNull: true,
      references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
    });
    await queryInterface.addColumn('menu_categories', 'scope', { type: DataTypes.ENUM('global', 'restaurant'), allowNull: false, defaultValue: 'restaurant' });
    await queryInterface.addColumn('menu_categories', 'global_name_key', { type: DataTypes.STRING(100), allowNull: true });
    await queryInterface.addColumn('menu_categories', 'image_url', { type: DataTypes.STRING(1000), allowNull: true });
    await queryInterface.addColumn('menu_categories', 'created_by', { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' });
    await queryInterface.addIndex('menu_categories', ['scope', 'is_active'], { name: 'menu_categories_scope_active_idx' });
    await queryInterface.addIndex('menu_categories', ['global_name_key'], { unique: true, name: 'menu_categories_global_name_uq' });

    await queryInterface.createTable('food_category_requests', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      requested_by: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: true },
      image_url: { type: DataTypes.STRING(1000), allowNull: true },
      status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
      approval_type: { type: DataTypes.ENUM('global', 'restaurant'), allowNull: true },
      approved_category_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'menu_categories', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      reviewed_by: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      rejection_reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('food_category_requests', ['restaurant_id', 'status'], { name: 'food_category_requests_restaurant_status_idx' });
    await queryInterface.addIndex('food_category_requests', ['status', 'created_at'], { name: 'food_category_requests_status_created_idx' });
    await queryInterface.createTable('food_category_request_history', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      request_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'food_category_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      action: { type: DataTypes.STRING(40), allowNull: false },
      previous_status: { type: DataTypes.STRING(20), allowNull: true },
      new_status: { type: DataTypes.STRING(20), allowNull: false },
      performed_by: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      comments: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('food_category_request_history', ['request_id', 'created_at'], { name: 'food_category_request_history_created_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('food_category_request_history');
    await queryInterface.dropTable('food_category_requests');
    await queryInterface.removeIndex('menu_categories', 'menu_categories_scope_active_idx');
    await queryInterface.removeIndex('menu_categories', 'menu_categories_global_name_uq');
    await queryInterface.removeColumn('menu_categories', 'created_by');
    await queryInterface.removeColumn('menu_categories', 'image_url');
    await queryInterface.removeColumn('menu_categories', 'scope');
    await queryInterface.removeColumn('menu_categories', 'global_name_key');
    await queryInterface.changeColumn('menu_categories', 'restaurant_id', {
      type: DataTypes.UUID, allowNull: false,
      references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
    });
  },
};

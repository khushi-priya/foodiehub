'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('menu_categories', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('menu_categories', ['restaurant_id', 'name'], { unique: true });
    await queryInterface.createTable('menu_items', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      category_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'menu_categories', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      name: { type: DataTypes.STRING(150), allowNull: false }, description: { type: DataTypes.TEXT, allowNull: true },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false }, discounted_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      image_url: { type: DataTypes.STRING(1000), allowNull: true },
      food_type: { type: DataTypes.ENUM('veg', 'non_veg', 'egg'), allowNull: false, defaultValue: 'veg' },
      preparation_time: { type: DataTypes.INTEGER, allowNull: true }, is_available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      is_featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('menu_items', ['restaurant_id', 'category_id']);
    await queryInterface.addIndex('menu_items', ['restaurant_id', 'is_available']);
    await queryInterface.createTable('menu_item_options', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      menu_item_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'menu_items', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      type: { type: DataTypes.ENUM('variant', 'addon'), allowNull: false }, name: { type: DataTypes.STRING(100), allowNull: false },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false }, display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('menu_item_options', ['restaurant_id', 'menu_item_id', 'type']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('menu_item_options');
    await queryInterface.dropTable('menu_items');
    await queryInterface.dropTable('menu_categories');
  },
};

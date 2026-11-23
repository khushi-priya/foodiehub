'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('menu_items', 'is_active', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
    await queryInterface.addColumn('menu_items', 'moderation_status', { type: DataTypes.ENUM('clear', 'hidden', 'disabled'), allowNull: false, defaultValue: 'clear' });
    await queryInterface.addColumn('menu_items', 'moderation_reason', { type: DataTypes.TEXT, allowNull: true });
    await queryInterface.addColumn('menu_items', 'moderated_by', { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' });
    await queryInterface.addColumn('menu_items', 'moderated_at', { type: DataTypes.DATE, allowNull: true });
    await queryInterface.addIndex('menu_items', ['moderation_status', 'is_active'], { name: 'menu_items_moderation_active_idx' });
    await queryInterface.addIndex('menu_items', ['created_at'], { name: 'menu_items_created_at_idx' });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('menu_items', 'menu_items_created_at_idx');
    await queryInterface.removeIndex('menu_items', 'menu_items_moderation_active_idx');
    await queryInterface.removeColumn('menu_items', 'moderated_at');
    await queryInterface.removeColumn('menu_items', 'moderated_by');
    await queryInterface.removeColumn('menu_items', 'moderation_reason');
    await queryInterface.removeColumn('menu_items', 'moderation_status');
    await queryInterface.removeColumn('menu_items', 'is_active');
  },
};

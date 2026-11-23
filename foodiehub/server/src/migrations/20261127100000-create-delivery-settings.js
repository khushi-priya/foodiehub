'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables();
    if (tables.some((table) => String(typeof table === 'string' ? table : table.tableName || table.name).toLowerCase() === 'delivery_settings')) return;
    await queryInterface.createTable('delivery_settings', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      automatic_assignment_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      max_active_assignments: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      acceptance_timeout_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
      created_at: { type: DataTypes.DATE, allowNull: false }, updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('delivery_settings', ['restaurant_id', 'branch_id'], { name: 'delivery_settings_restaurant_branch_idx' });
  },
  async down(queryInterface) { await queryInterface.dropTable('delivery_settings'); },
};

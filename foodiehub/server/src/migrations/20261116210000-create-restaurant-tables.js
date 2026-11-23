'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('restaurant_tables', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      table_number: { type: DataTypes.STRING(50), allowNull: false },
      seating_capacity: { type: DataTypes.INTEGER, allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      qr_token: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('restaurant_tables', ['branch_id', 'table_number'], { unique: true, name: 'restaurant_tables_branch_number_unique' });
    await queryInterface.addIndex('restaurant_tables', ['restaurant_id', 'is_active'], { name: 'restaurant_tables_restaurant_active_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('restaurant_tables');
  },
};

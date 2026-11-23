'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('menu_items');
    if (!columns.dietary_tags) await queryInterface.addColumn('menu_items', 'dietary_tags', { type: DataTypes.JSON, allowNull: true });
    if (!columns.allergen_tags) await queryInterface.addColumn('menu_items', 'allergen_tags', { type: DataTypes.JSON, allowNull: true });
  },
  async down(queryInterface) {
    const columns = await queryInterface.describeTable('menu_items');
    if (columns.dietary_tags || columns.allergen_tags) throw new Error('Cannot remove dietary/allergen metadata while menu items may contain data.');
  },
};

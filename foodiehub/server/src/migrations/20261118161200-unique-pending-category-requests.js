'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('food_category_requests', 'pending_name_key', { type: DataTypes.STRING(100), allowNull: true });
    await queryInterface.addIndex('food_category_requests', ['restaurant_id', 'pending_name_key'], { unique: true, name: 'food_category_requests_pending_name_uq' });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('food_category_requests', 'food_category_requests_pending_name_uq');
    await queryInterface.removeColumn('food_category_requests', 'pending_name_key');
  },
};

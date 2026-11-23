'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('food_category_requests', 'display_order', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('food_category_requests', 'display_order');
  },
};

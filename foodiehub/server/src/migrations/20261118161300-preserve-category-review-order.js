'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.changeColumn('food_category_request_history', 'created_at', { type: DataTypes.DATE(3), allowNull: false, defaultValue: DataTypes.NOW });
  },
  async down(queryInterface) {
    await queryInterface.changeColumn('food_category_request_history', 'created_at', { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW });
  },
};

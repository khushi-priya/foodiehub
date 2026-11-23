'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('orders', 'packaging_fee', { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'packaging_fee');
  },
};

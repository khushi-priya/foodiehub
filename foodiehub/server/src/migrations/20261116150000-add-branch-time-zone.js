'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('branches', 'time_zone', {
      type: DataTypes.STRING(64), allowNull: false, defaultValue: 'Asia/Kolkata',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('branches', 'time_zone');
  },
};

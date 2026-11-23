'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('delivery_settings');
    if (!columns.manual_assignment_enabled) {
      await queryInterface.addColumn('delivery_settings', 'manual_assignment_enabled', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
  },
  async down(queryInterface) {
    const columns = await queryInterface.describeTable('delivery_settings');
    if (columns.manual_assignment_enabled) await queryInterface.removeColumn('delivery_settings', 'manual_assignment_enabled');
  },
};

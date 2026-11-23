'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    const description = await queryInterface.describeTable('audit_logs');
    if (!description.reason) await queryInterface.addColumn('audit_logs', 'reason', { type: DataTypes.TEXT, allowNull: true });
  },
  async down(queryInterface) {
    const description = await queryInterface.describeTable('audit_logs');
    if (description.reason) await queryInterface.removeColumn('audit_logs', 'reason');
  },
};

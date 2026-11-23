'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.changeColumn('orders', 'payment_status', {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'refund_pending', 'refund_failed'),
      allowNull: false,
      defaultValue: 'pending',
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query("UPDATE orders SET payment_status = 'paid' WHERE payment_status IN ('partially_refunded','refund_pending','refund_failed')");
    await queryInterface.changeColumn('orders', 'payment_status', {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
      allowNull: false,
      defaultValue: 'pending',
    });
  },
};

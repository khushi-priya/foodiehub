'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('branches', 'razorpay_enabled', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('orders', 'razorpay_order_id', {
      type: DataTypes.STRING(80),
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('orders', 'razorpay_payment_id', {
      type: DataTypes.STRING(80),
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('order_items', 'variant_option_id', {
      type: DataTypes.UUID,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('order_items', 'variant_option_id');
    await queryInterface.removeColumn('orders', 'razorpay_payment_id');
    await queryInterface.removeColumn('orders', 'razorpay_order_id');
    await queryInterface.removeColumn('branches', 'razorpay_enabled');
  },
};

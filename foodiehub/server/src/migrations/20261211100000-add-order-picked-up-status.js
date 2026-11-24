'use strict';

const { DataTypes } = require('sequelize');

const orderStatus = DataTypes.ENUM('pending', 'accepted', 'rejected', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'completed', 'cancelled');
const previousOrderStatus = DataTypes.ENUM('pending', 'accepted', 'rejected', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled');

module.exports = {
  async up(queryInterface) {
    await queryInterface.changeColumn('orders', 'status', { type: orderStatus, allowNull: false, defaultValue: 'pending' });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query("UPDATE orders SET status = 'ready' WHERE status = 'picked_up'");
    await queryInterface.changeColumn('orders', 'status', { type: previousOrderStatus, allowNull: false, defaultValue: 'pending' });
  },
};

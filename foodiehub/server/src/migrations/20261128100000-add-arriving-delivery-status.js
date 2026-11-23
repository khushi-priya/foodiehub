'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.changeColumn('delivery_assignments', 'status', {
      type: DataTypes.ENUM('pending_acceptance', 'accepted', 'arriving_at_restaurant', 'rejected', 'picked_up', 'on_the_way', 'delivered', 'failed', 'cancelled', 'reassigned'),
      allowNull: false,
      defaultValue: 'pending_acceptance',
    });
  },
  async down(queryInterface) {
    await queryInterface.changeColumn('delivery_assignments', 'status', {
      type: DataTypes.ENUM('pending_acceptance', 'accepted', 'rejected', 'picked_up', 'on_the_way', 'delivered', 'failed', 'cancelled', 'reassigned'),
      allowNull: false,
      defaultValue: 'pending_acceptance',
    });
  },
};

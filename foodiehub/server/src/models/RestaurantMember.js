
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RestaurantMember = sequelize.define(
  'RestaurantMember',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    restaurantId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'restaurant_id',
      references: {
        model: 'restaurants',
        key: 'id',
      },
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id',
      },
    },

    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'role_id',
      references: {
        model: 'roles',
        key: 'id',
      },
    },

    status: {
      type: DataTypes.ENUM('invited', 'active', 'inactive', 'suspended'),
      defaultValue: 'invited',
      allowNull: false,
    },

    joinedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'joined_at',
    },

    employeeId: { type: DataTypes.STRING(40), allowNull: true, field: 'employee_id' },
    availabilityStatus: { type: DataTypes.ENUM('offline', 'available', 'on_delivery'), allowNull: false, defaultValue: 'offline', field: 'availability_status' },
  },
  {
    tableName: 'restaurant_members',
    indexes: [
      {
        unique: true,
        fields: ['restaurant_id', 'user_id'],
      },
      { fields: ['role_id'] },
      { fields: ['status'] },
      { unique: true, fields: ['restaurant_id', 'employee_id'], name: 'restaurant_members_restaurant_employee_id_uq' },
    ],
  }
);

module.exports = RestaurantMember;


const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Role = sequelize.define(
  'Role',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    code: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },

    restaurantId: { type: DataTypes.UUID, allowNull: true, field: 'restaurant_id' },

    scope: {
      type: DataTypes.ENUM('platform', 'restaurant'),
      allowNull: false,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_system',
    },
  },
  {
    tableName: 'roles',
  }
);

module.exports = Role;

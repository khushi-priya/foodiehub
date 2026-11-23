const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CustomerAddress', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customerId: { type: DataTypes.UUID, allowNull: false, field: 'customer_id' },
  fullName: { type: DataTypes.STRING(150), allowNull: false, field: 'full_name' },
  phone: { type: DataTypes.STRING(20), allowNull: false },
  house: { type: DataTypes.STRING(150), allowNull: false },
  street: { type: DataTypes.STRING(255), allowNull: false },
  landmark: { type: DataTypes.STRING(150), allowNull: true },
  city: { type: DataTypes.STRING(100), allowNull: false },
  state: { type: DataTypes.STRING(100), allowNull: false },
  postalCode: { type: DataTypes.STRING(20), allowNull: false, field: 'postal_code' },
  latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
  longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
  addressType: { type: DataTypes.ENUM('home', 'work', 'other'), defaultValue: 'home', allowNull: false, field: 'address_type' },
  isDefault: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false, field: 'is_default' },
}, { tableName: 'customer_addresses', indexes: [{ fields: ['customer_id'] }, { fields: ['customer_id', 'is_default'] }] });

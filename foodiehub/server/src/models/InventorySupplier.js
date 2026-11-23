const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('InventorySupplier', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  name: { type: DataTypes.STRING(150), allowNull: false },
  contactName: { type: DataTypes.STRING(150), allowNull: true, field: 'contact_name' },
  email: { type: DataTypes.STRING(150), allowNull: true },
  phone: { type: DataTypes.STRING(30), allowNull: true },
  address: { type: DataTypes.STRING(500), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
}, { tableName: 'inventory_suppliers' });

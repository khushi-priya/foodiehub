const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('MenuCategory', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: true, field: 'restaurant_id' },
  scope: { type: DataTypes.ENUM('global', 'restaurant'), allowNull: false, defaultValue: 'restaurant' },
  globalNameKey: { type: DataTypes.STRING(100), allowNull: true, field: 'global_name_key' },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.STRING(500), allowNull: true },
  imageUrl: { type: DataTypes.STRING(1000), allowNull: true, field: 'image_url' },
  createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false, field: 'is_active' },
  displayOrder: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false, field: 'display_order' },
}, { tableName: 'menu_categories', indexes: [{ unique: true, fields: ['restaurant_id', 'name'] }, { fields: ['scope', 'is_active'] }] });

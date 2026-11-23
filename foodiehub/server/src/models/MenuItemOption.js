const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('MenuItemOption', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  menuItemId: { type: DataTypes.UUID, allowNull: false, field: 'menu_item_id' },
  type: { type: DataTypes.ENUM('variant', 'addon'), allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, validate: { min: 0 } },
  displayOrder: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false, field: 'display_order' },
}, { tableName: 'menu_item_options', indexes: [{ fields: ['restaurant_id', 'menu_item_id', 'type'] }] });

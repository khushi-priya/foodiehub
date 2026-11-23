const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CustomerWishlistItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customerId: { type: DataTypes.UUID, allowNull: false, field: 'customer_id' },
  targetType: { type: DataTypes.ENUM('restaurant', 'food'), allowNull: false, field: 'target_type' },
  restaurantId: { type: DataTypes.UUID, allowNull: true, field: 'restaurant_id' },
  menuItemId: { type: DataTypes.UUID, allowNull: true, field: 'menu_item_id' },
}, { tableName: 'customer_wishlist_items', indexes: [{ fields: ['customer_id'] }, { unique: true, fields: ['customer_id', 'restaurant_id'] }, { unique: true, fields: ['customer_id', 'menu_item_id'] }] });

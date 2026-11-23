const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CustomerCartItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  cartId: { type: DataTypes.UUID, allowNull: false, field: 'cart_id' },
  menuItemId: { type: DataTypes.UUID, allowNull: false, field: 'menu_item_id' },
  variantOptionId: { type: DataTypes.UUID, allowNull: true, field: 'variant_option_id' },
  addonOptionIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'addon_option_ids' },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1, max: 99 } },
}, { tableName: 'customer_cart_items', indexes: [{ fields: ['cart_id'] }, { fields: ['menu_item_id'] }] });

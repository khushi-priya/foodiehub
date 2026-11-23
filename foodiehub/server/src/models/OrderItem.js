const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderItem = sequelize.define(
  'OrderItem',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'order_id',
      references: {
        model: 'orders',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },

    menuItemId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'menu_item_id',
    },

    itemName: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'item_name',
    },

    itemDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'item_description',
    },

    variantName: { type: DataTypes.STRING(100), allowNull: true, field: 'variant_name' },
    variantOptionId: { type: DataTypes.UUID, allowNull: true, field: 'variant_option_id' },
    addonsSnapshot: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'addons_snapshot' },

    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
    },

    unitPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'unit_price',
    },

    lineTotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'line_total',
    },

    itemNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'item_notes',
    },
  },
  {
    tableName: 'order_items',
    indexes: [
      { fields: ['order_id'] },
      { fields: ['menu_item_id'] },
    ],
  }
);

module.exports = OrderItem;

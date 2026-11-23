const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CustomerCart', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customerId: { type: DataTypes.UUID, allowNull: false, field: 'customer_id' },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id' },
  tableId: { type: DataTypes.UUID, allowNull: true, field: 'table_id', references: { model: 'restaurant_tables', key: 'id' } },
  tableQrTokenHash: { type: DataTypes.STRING(64), allowNull: true, field: 'table_qr_token_hash' },
}, { tableName: 'customer_carts', indexes: [{ unique: true, fields: ['customer_id'] }] });

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CustomerReorderRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customerId: { type: DataTypes.UUID, allowNull: false, field: 'customer_id' },
  sourceOrderId: { type: DataTypes.UUID, allowNull: false, field: 'source_order_id' },
  idempotencyKey: { type: DataTypes.UUID, allowNull: false, field: 'idempotency_key' },
}, {
  tableName: 'customer_reorder_requests',
  indexes: [{ unique: true, fields: ['customer_id', 'idempotency_key'], name: 'customer_reorder_customer_key_uq' }],
});

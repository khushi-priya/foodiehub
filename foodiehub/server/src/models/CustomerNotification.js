const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CustomerNotification', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customerId: { type: DataTypes.UUID, allowNull: false, field: 'customer_id' },
  category: { type: DataTypes.STRING(32), allowNull: false },
  title: { type: DataTypes.STRING(120), allowNull: false },
  message: { type: DataTypes.STRING(500), allowNull: false },
  href: { type: DataTypes.STRING(255), allowNull: true },
  entityId: { type: DataTypes.STRING(80), allowNull: true, field: 'entity_id' },
  dedupeKey: { type: DataTypes.STRING(150), allowNull: true, field: 'dedupe_key' },
  readAt: { type: DataTypes.DATE, allowNull: true, field: 'read_at' },
}, {
  tableName: 'customer_notifications',
  indexes: [
    { fields: ['customer_id', 'created_at'], name: 'customer_notifications_customer_created_idx' },
    { fields: ['customer_id', 'read_at'], name: 'customer_notifications_customer_read_idx' },
    { unique: true, fields: ['customer_id', 'dedupe_key'], name: 'customer_notifications_dedupe_uq' },
  ],
});

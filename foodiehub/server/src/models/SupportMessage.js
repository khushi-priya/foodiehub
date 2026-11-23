const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('SupportMessage', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ticketId: { type: DataTypes.UUID, allowNull: false, field: 'ticket_id' },
  authorUserId: { type: DataTypes.UUID, allowNull: false, field: 'author_user_id' },
  authorType: { type: DataTypes.ENUM('restaurant', 'admin', 'customer'), allowNull: false, field: 'author_type' },
  body: { type: DataTypes.TEXT, allowNull: false },
}, { tableName: 'support_messages', indexes: [{ fields: ['ticket_id', 'created_at'], name: 'support_messages_ticket_created_idx' }] });

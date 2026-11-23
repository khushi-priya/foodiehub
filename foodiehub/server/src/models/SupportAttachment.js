const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('SupportAttachment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ticketId: { type: DataTypes.UUID, allowNull: false, field: 'ticket_id' },
  messageId: { type: DataTypes.UUID, allowNull: true, field: 'message_id' },
  uploadedByUserId: { type: DataTypes.UUID, allowNull: false, field: 'uploaded_by_user_id' },
  fileName: { type: DataTypes.STRING(180), allowNull: false, field: 'file_name' },
  contentType: { type: DataTypes.STRING(100), allowNull: false, field: 'content_type' },
  sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'size_bytes' },
  fileData: { type: DataTypes.BLOB('long'), allowNull: false, field: 'file_data' },
}, { tableName: 'support_attachments', indexes: [{ fields: ['ticket_id'], name: 'support_attachments_ticket_idx' }, { fields: ['message_id'], name: 'support_attachments_message_idx' }] });

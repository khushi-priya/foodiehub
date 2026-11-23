const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('AuditLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  actorUserId: { type: DataTypes.UUID, allowNull: true, field: 'actor_user_id' },
  actorRole: { type: DataTypes.STRING(80), allowNull: true, field: 'actor_role' },
  action: { type: DataTypes.STRING(120), allowNull: false },
  entityType: { type: DataTypes.STRING(80), allowNull: false, field: 'entity_type' },
  entityId: { type: DataTypes.STRING(80), allowNull: false, field: 'entity_id' },
  reason: { type: DataTypes.TEXT, allowNull: true },
  beforeData: { type: DataTypes.JSON, allowNull: true, field: 'before_data' },
  afterData: { type: DataTypes.JSON, allowNull: true, field: 'after_data' },
  ipAddress: { type: DataTypes.STRING(45), allowNull: true, field: 'ip_address' },
  userAgent: { type: DataTypes.STRING(255), allowNull: true, field: 'user_agent' },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
}, {
  tableName: 'audit_logs',
  timestamps: false,
  indexes: [
    { fields: ['actor_user_id', 'created_at'], name: 'audit_logs_actor_created_idx' },
    { fields: ['entity_type', 'entity_id', 'created_at'], name: 'audit_logs_entity_created_idx' },
    { fields: ['action', 'created_at'], name: 'audit_logs_action_created_idx' },
  ],
  hooks: {
    beforeUpdate() { throw new Error('Audit records are immutable.'); },
    beforeDestroy() { throw new Error('Audit records are immutable.'); },
    beforeBulkUpdate() { throw new Error('Audit records are immutable.'); },
    beforeBulkDestroy() { throw new Error('Audit records are immutable.'); },
  },
});

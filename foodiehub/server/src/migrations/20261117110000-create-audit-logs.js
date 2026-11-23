'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('audit_logs', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      actor_user_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      actor_role: { type: DataTypes.STRING(80), allowNull: true },
      action: { type: DataTypes.STRING(120), allowNull: false },
      entity_type: { type: DataTypes.STRING(80), allowNull: false },
      entity_id: { type: DataTypes.STRING(80), allowNull: false },
      before_data: { type: DataTypes.JSON, allowNull: true },
      after_data: { type: DataTypes.JSON, allowNull: true },
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.STRING(255), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('audit_logs', ['actor_user_id', 'created_at'], { name: 'audit_logs_actor_created_idx' });
    await queryInterface.addIndex('audit_logs', ['entity_type', 'entity_id', 'created_at'], { name: 'audit_logs_entity_created_idx' });
    await queryInterface.addIndex('audit_logs', ['action', 'created_at'], { name: 'audit_logs_action_created_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
  },
};

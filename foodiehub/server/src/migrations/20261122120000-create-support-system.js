'use strict';

const { DataTypes } = require('sequelize');
const { randomUUID } = require('crypto');

async function hasTable(queryInterface, name) {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => String(typeof table === 'string' ? table : table.tableName || table.name).toLowerCase() === name.toLowerCase());
}

async function ensureIndex(queryInterface, table, name, fields) {
  const indexes = await queryInterface.showIndex(table);
  if (!indexes.some((index) => index.name === name)) await queryInterface.addIndex(table, fields, { name });
}

async function grantPermissions(queryInterface, roleCode, codes) {
  const [[role]] = await queryInterface.sequelize.query('SELECT id FROM roles WHERE code = :roleCode LIMIT 1', { replacements: { roleCode } });
  if (!role) return;
  const [permissions] = await queryInterface.sequelize.query('SELECT id FROM permissions WHERE code IN (:codes)', { replacements: { codes } });
  if (!permissions.length) return;
  const [existing] = await queryInterface.sequelize.query('SELECT permission_id FROM role_permissions WHERE role_id = :roleId AND permission_id IN (:ids)', { replacements: { roleId: role.id, ids: permissions.map((item) => item.id) } });
  const existingIds = new Set(existing.map((item) => item.permission_id));
  const missing = permissions.filter((item) => !existingIds.has(item.id));
  if (missing.length) await queryInterface.bulkInsert('role_permissions', missing.map((item) => ({ role_id: role.id, permission_id: item.id })));
}

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const definitions = [
      ['support.view', 'support', 'View restaurant support tickets and replies'],
      ['support.create', 'support', 'Create restaurant support tickets and reply'],
    ];
    const [existing] = await queryInterface.sequelize.query('SELECT code FROM permissions WHERE code IN (:codes)', { replacements: { codes: definitions.map(([code]) => code) } });
    const existingCodes = new Set(existing.map((item) => item.code));
    const missing = definitions.filter(([code]) => !existingCodes.has(code));
    if (missing.length) await queryInterface.bulkInsert('permissions', missing.map(([code, module, description]) => ({ id: randomUUID(), code, module, description, created_at: now, updated_at: now })));

    if (!(await hasTable(queryInterface, 'support_tickets'))) {
      await queryInterface.createTable('support_tickets', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        reference: { type: DataTypes.STRING(32), allowNull: false, unique: true },
        restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onDelete: 'CASCADE' },
        created_by_user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
        related_branch_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'branches', key: 'id' }, onDelete: 'SET NULL' },
        related_order_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'orders', key: 'id' }, onDelete: 'SET NULL' },
        assigned_admin_user_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
        subject: { type: DataTypes.STRING(180), allowNull: false },
        category: { type: DataTypes.STRING(60), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: false },
        priority: { type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'), allowNull: false, defaultValue: 'normal' },
        status: { type: DataTypes.ENUM('open', 'in_progress', 'waiting_for_restaurant', 'resolved', 'closed'), allowNull: false, defaultValue: 'open' },
        last_reply_at: { type: DataTypes.DATE, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
    }
    await ensureIndex(queryInterface, 'support_tickets', 'support_tickets_restaurant_created_idx', ['restaurant_id', 'created_at']);
    await ensureIndex(queryInterface, 'support_tickets', 'support_tickets_restaurant_status_idx', ['restaurant_id', 'status']);

    if (!(await hasTable(queryInterface, 'support_messages'))) {
      await queryInterface.createTable('support_messages', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        ticket_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'support_tickets', key: 'id' }, onDelete: 'CASCADE' },
        author_user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
        author_type: { type: DataTypes.ENUM('restaurant', 'admin'), allowNull: false },
        body: { type: DataTypes.TEXT, allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
    }
    await ensureIndex(queryInterface, 'support_messages', 'support_messages_ticket_created_idx', ['ticket_id', 'created_at']);

    if (!(await hasTable(queryInterface, 'support_attachments'))) {
      await queryInterface.createTable('support_attachments', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        ticket_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'support_tickets', key: 'id' }, onDelete: 'CASCADE' },
        message_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'support_messages', key: 'id' }, onDelete: 'CASCADE' },
        uploaded_by_user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
        file_name: { type: DataTypes.STRING(180), allowNull: false },
        content_type: { type: DataTypes.STRING(100), allowNull: false },
        size_bytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        file_data: { type: DataTypes.BLOB('long'), allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
    }
    await ensureIndex(queryInterface, 'support_attachments', 'support_attachments_ticket_idx', ['ticket_id']);
    await ensureIndex(queryInterface, 'support_attachments', 'support_attachments_message_idx', ['message_id']);

    await grantPermissions(queryInterface, 'restaurant_owner', ['support.view', 'support.create']);
    await grantPermissions(queryInterface, 'manager', ['support.view', 'support.create']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('support_attachments');
    await queryInterface.dropTable('support_messages');
    await queryInterface.dropTable('support_tickets');
    await queryInterface.sequelize.query("DELETE rp FROM role_permissions rp INNER JOIN permissions p ON p.id = rp.permission_id WHERE p.code IN ('support.view','support.create')");
    await queryInterface.bulkDelete('permissions', { code: ['support.view', 'support.create'] });
  },
};

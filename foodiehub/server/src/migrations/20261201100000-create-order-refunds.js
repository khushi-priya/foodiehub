'use strict';
const { DataTypes } = require('sequelize');
const { randomUUID } = require('node:crypto');

module.exports = {
  async up(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const hasRefundTable = tables.some((table) => String(typeof table === 'string' ? table : table.tableName).toLowerCase() === 'order_refunds');
    if (!hasRefundTable) await queryInterface.createTable('order_refunds', {
      id: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
      order_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      requested_by_user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      reason: { type: DataTypes.STRING(1000), allowNull: false },
      status: { type: DataTypes.ENUM('requested', 'pending', 'processed', 'failed', 'unknown'), allowNull: false, defaultValue: 'requested' },
      razorpay_refund_id: { type: DataTypes.STRING(80), allowNull: true, unique: true },
      provider_status: { type: DataTypes.STRING(40), allowNull: true },
      failure_code: { type: DataTypes.STRING(100), allowNull: true },
      processed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    if (!hasRefundTable) await queryInterface.addIndex('order_refunds', ['restaurant_id', 'created_at'], { name: 'order_refunds_restaurant_created_idx' });
    const [owners] = await queryInterface.sequelize.query("SELECT id FROM roles WHERE code = 'restaurant_owner' AND scope = 'restaurant' LIMIT 1");
    if (owners[0]) {
      const [permissions] = await queryInterface.sequelize.query("SELECT id FROM permissions WHERE code = 'payments.refund' LIMIT 1");
      let permissionId = permissions[0]?.id;
      if (!permissionId) {
        permissionId = randomUUID();
        await queryInterface.bulkInsert('permissions', [{ id: permissionId, code: 'payments.refund', module: 'payments', description: 'Issue and reconcile full order refunds', created_at: new Date(), updated_at: new Date() }]);
      }
      const [assignments] = await queryInterface.sequelize.query('SELECT role_id FROM role_permissions WHERE role_id = :roleId AND permission_id = :permissionId LIMIT 1', { replacements: { roleId: owners[0].id, permissionId } });
      if (!assignments.length) await queryInterface.bulkInsert('role_permissions', [{ role_id: owners[0].id, permission_id: permissionId }]);
    }
  },
  async down(queryInterface) {
    // Keep the permission and assignments intact on rollback; they may have
    // been created by the system-role seeder rather than this migration.
    await queryInterface.dropTable('order_refunds');
  },
};

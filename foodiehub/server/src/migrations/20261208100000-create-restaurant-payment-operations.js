'use strict';
const { DataTypes } = require('sequelize');
const { randomUUID } = require('node:crypto');

const permissions = [
  ['payments.transactions.view', 'View payment transactions'],
  ['payments.cod.view', 'View COD collections'],
  ['payments.cash_reconcile', 'Submit and reconcile cash handovers'],
  ['payments.settlements.view', 'View restaurant settlements'],
  ['payments.refunds.view', 'View restaurant refunds'],
];

module.exports = {
  async up(q) {
    await q.createTable('order_payment_attempts', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'branches', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      gateway: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'razorpay' },
      gateway_order_id: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      gateway_payment_id: { type: DataTypes.STRING(80), allowNull: true, unique: true },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
      status: { type: DataTypes.ENUM('pending', 'authorized', 'captured', 'failed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
      failure_code: { type: DataTypes.STRING(100), allowNull: true },
      failure_description: { type: DataTypes.STRING(500), allowNull: true },
      captured_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('order_payment_attempts', ['order_id', 'created_at'], { name: 'order_payment_attempts_order_date_idx' });
    await q.addIndex('order_payment_attempts', ['restaurant_id', 'status', 'created_at'], { name: 'order_payment_attempts_restaurant_status_idx' });
    await q.createTable('cod_collections', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      assignment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'delivery_assignments', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      restaurant_member_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_members', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      expected_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      collected_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      status: { type: DataTypes.ENUM('awaiting_collection', 'collected', 'collection_failed', 'disputed', 'reconciled'), allowNull: false, defaultValue: 'awaiting_collection' },
      reason: { type: DataTypes.STRING(1000), allowNull: true },
      request_key: { type: DataTypes.UUID, allowNull: false, unique: true },
      collected_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('cod_collections', ['restaurant_id', 'branch_id', 'status', 'created_at'], { name: 'cod_collections_branch_status_date_idx' });
    await q.addIndex('cod_collections', ['restaurant_member_id', 'status', 'created_at'], { name: 'cod_collections_member_status_date_idx' });
    await q.addIndex('cod_collections', ['order_id', 'created_at'], { name: 'cod_collections_order_date_idx' });
    await q.createTable('cash_handovers', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      restaurant_member_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_members', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      expected_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      submitted_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      received_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      status: { type: DataTypes.ENUM('pending', 'confirmed', 'disputed'), allowNull: false, defaultValue: 'pending' },
      idempotency_key: { type: DataTypes.UUID, allowNull: false, unique: true },
      submitted_at: { type: DataTypes.DATE, allowNull: false },
      received_at: { type: DataTypes.DATE, allowNull: true },
      received_by_user_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      notes: { type: DataTypes.STRING(1000), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('cash_handovers', ['restaurant_id', 'branch_id', 'status', 'submitted_at'], { name: 'cash_handovers_branch_status_date_idx' });
    await q.addIndex('cash_handovers', ['restaurant_member_id', 'submitted_at'], { name: 'cash_handovers_member_date_idx' });
    await q.createTable('cash_handover_items', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      handover_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'cash_handovers', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      cod_collection_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'cod_collections', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.createTable('razorpay_webhook_events', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      event_id: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      event_type: { type: DataTypes.STRING(80), allowNull: false },
      gateway_order_id: { type: DataTypes.STRING(80), allowNull: true },
      gateway_payment_id: { type: DataTypes.STRING(80), allowNull: true },
      status: { type: DataTypes.ENUM('processing', 'processed', 'failed', 'ignored'), allowNull: false, defaultValue: 'processing' },
      result: { type: DataTypes.STRING(500), allowNull: true },
      processed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.addIndex('razorpay_webhook_events', ['event_type', 'created_at'], { name: 'razorpay_webhook_type_date_idx' });
    await q.addIndex('razorpay_webhook_events', ['gateway_order_id'], { name: 'razorpay_webhook_order_idx' });

    const now = new Date();
    for (const [code, description] of permissions) {
      const [rows] = await q.sequelize.query('SELECT id FROM permissions WHERE code = :code LIMIT 1', { replacements: { code } });
      if (!rows.length) await q.bulkInsert('permissions', [{ id: randomUUID(), code, module: 'payments', description, created_at: now, updated_at: now }]);
    }
    const [ownerRows] = await q.sequelize.query("SELECT id FROM roles WHERE code = 'restaurant_owner' AND scope = 'restaurant' LIMIT 1");
    const [permissionRows] = await q.sequelize.query("SELECT id FROM permissions WHERE code IN ('payments.transactions.view','payments.cod.view','payments.cash_reconcile','payments.settlements.view','payments.refunds.view')");
    if (ownerRows[0] && permissionRows.length) {
      const roleIds = permissionRows.map(() => '?').join(',');
      const [links] = await q.sequelize.query(`SELECT permission_id FROM role_permissions WHERE role_id = ? AND permission_id IN (${roleIds})`, { replacements: [ownerRows[0].id, ...permissionRows.map((row) => row.id)] });
      const linked = new Set(links.map((link) => link.permission_id));
      const missing = permissionRows.filter((row) => !linked.has(row.id)).map((row) => ({ role_id: ownerRows[0].id, permission_id: row.id }));
      if (missing.length) await q.bulkInsert('role_permissions', missing);
    }
  },
  async down(q) {
    await q.dropTable('cash_handover_items');
    await q.dropTable('cash_handovers');
    await q.dropTable('cod_collections');
    await q.dropTable('razorpay_webhook_events');
    await q.dropTable('order_payment_attempts');
    // Preserve permissions: roles may have been customized after migration.
  },
};

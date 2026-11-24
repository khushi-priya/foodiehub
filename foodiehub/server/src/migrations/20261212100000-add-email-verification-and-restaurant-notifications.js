'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    const existingColumns = await queryInterface.describeTable('users');
    const otpColumns = {
      email_verification_otp_hash: { type: DataTypes.STRING(64), allowNull: true },
      email_verification_otp_expires_at: { type: DataTypes.DATE, allowNull: true },
      email_verification_otp_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      email_verification_otp_sent_at: { type: DataTypes.DATE, allowNull: true },
      email_verification_otp_request_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      email_verification_otp_request_window_at: { type: DataTypes.DATE, allowNull: true },
    };
    for (const [column, definition] of Object.entries(otpColumns)) {
      if (!existingColumns[column]) await queryInterface.addColumn('users', column, definition);
    }

    // Existing active customers with no verified timestamp remain unverified.
    // They can complete OTP verification without changing their account status.
    const tableNames = await queryInterface.showAllTables();
    const hasNotificationsTable = tableNames.some((table) => (typeof table === 'string' ? table : table.tableName) === 'restaurant_notifications');
    if (!hasNotificationsTable) await queryInterface.createTable('restaurant_notifications', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'branches', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      restaurant_member_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_members', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      category: { type: DataTypes.ENUM('orders', 'kitchen', 'reservations', 'delivery', 'payments', 'staff', 'branch'), allowNull: false },
      title: { type: DataTypes.STRING(150), allowNull: false },
      message: { type: DataTypes.STRING(500), allowNull: false },
      href: { type: DataTypes.STRING(255), allowNull: true },
      entity_id: { type: DataTypes.STRING(80), allowNull: true },
      dedupe_key: { type: DataTypes.STRING(180), allowNull: true },
      read_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    const notificationIndexes = await queryInterface.showIndex('restaurant_notifications');
    const indexNames = new Set(notificationIndexes.map((index) => index.name));
    if (!indexNames.has('restaurant_notifications_inbox_idx')) await queryInterface.addIndex('restaurant_notifications', ['restaurant_id', 'restaurant_member_id', 'read_at', 'created_at'], { name: 'restaurant_notifications_inbox_idx' });
    if (!indexNames.has('restaurant_notifications_dedupe_idx')) await queryInterface.addIndex('restaurant_notifications', ['restaurant_member_id', 'dedupe_key'], { unique: true, name: 'restaurant_notifications_dedupe_idx' });
    if (!indexNames.has('restaurant_notifications_branch_idx')) await queryInterface.addIndex('restaurant_notifications', ['branch_id', 'created_at'], { name: 'restaurant_notifications_branch_idx' });
  },
  async down(queryInterface) {
    const tableNames = await queryInterface.showAllTables();
    if (tableNames.some((table) => (typeof table === 'string' ? table : table.tableName) === 'restaurant_notifications')) {
      await queryInterface.dropTable('restaurant_notifications');
    }
    // OTP columns may already have existed before this migration. Retain them
    // on rollback rather than risk dropping customer verification data.
  },
};

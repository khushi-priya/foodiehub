'use strict';

const { DataTypes } = require('sequelize');

async function hasTable(queryInterface, name) {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => String(typeof table === 'string' ? table : table.tableName || table.name).toLowerCase() === name.toLowerCase());
}

module.exports = {
  async up(queryInterface) {
    if (!(await hasTable(queryInterface, 'customer_notification_preferences'))) {
      await queryInterface.createTable('customer_notification_preferences', {
        customer_id: { type: DataTypes.UUID, primaryKey: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        order_updates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        payment_updates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        reservation_updates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        delivery_updates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        support_updates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        marketing_updates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
    }
    if (!(await hasTable(queryInterface, 'customer_notifications'))) {
      await queryInterface.createTable('customer_notifications', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        customer_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        category: { type: DataTypes.STRING(32), allowNull: false },
        title: { type: DataTypes.STRING(120), allowNull: false },
        message: { type: DataTypes.STRING(500), allowNull: false },
        href: { type: DataTypes.STRING(255), allowNull: true },
        entity_id: { type: DataTypes.STRING(80), allowNull: true },
        dedupe_key: { type: DataTypes.STRING(150), allowNull: true },
        read_at: { type: DataTypes.DATE, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex('customer_notifications', ['customer_id', 'created_at'], { name: 'customer_notifications_customer_created_idx' });
      await queryInterface.addIndex('customer_notifications', ['customer_id', 'read_at'], { name: 'customer_notifications_customer_read_idx' });
      await queryInterface.addIndex('customer_notifications', ['customer_id', 'dedupe_key'], { name: 'customer_notifications_dedupe_uq', unique: true });
    }
  },

  async down(queryInterface) {
    const [notifications] = await queryInterface.sequelize.query('SELECT id FROM customer_notifications LIMIT 1');
    const [preferences] = await queryInterface.sequelize.query('SELECT customer_id FROM customer_notification_preferences LIMIT 1');
    if (notifications.length || preferences.length) throw new Error('Cannot drop customer notification tables while notification or preference data exists.');
    await queryInterface.dropTable('customer_notifications');
    await queryInterface.dropTable('customer_notification_preferences');
  },
};

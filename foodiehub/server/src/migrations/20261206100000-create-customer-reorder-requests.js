'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('customer_reorder_requests', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      customer_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      source_order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      idempotency_key: { type: DataTypes.UUID, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('customer_reorder_requests', ['customer_id', 'idempotency_key'], { unique: true, name: 'customer_reorder_customer_key_uq' });
  },
  async down(queryInterface) {
    const [rows] = await queryInterface.sequelize.query('SELECT id FROM customer_reorder_requests LIMIT 1');
    if (rows.length) throw new Error('Cannot drop customer reorder idempotency records while data exists.');
    await queryInterface.dropTable('customer_reorder_requests');
  },
};

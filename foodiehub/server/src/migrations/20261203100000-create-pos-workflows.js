'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.changeColumn('orders', 'customer_id', {
      type: DataTypes.UUID,
      allowNull: true,
    });
    await queryInterface.createTable('pos_order_requests', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      idempotency_key: { type: DataTypes.UUID, allowNull: false, unique: true },
      request_hash: { type: DataTypes.STRING(64), allowNull: false },
      order_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('pos_order_requests', ['restaurant_id', 'branch_id', 'created_at']);
    await queryInterface.createTable('pos_tenders', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      created_by_user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      idempotency_key: { type: DataTypes.UUID, allowNull: false, unique: true },
      method: { type: DataTypes.ENUM('cash', 'razorpay'), allowNull: false },
      status: { type: DataTypes.ENUM('pending', 'paid', 'failed'), allowNull: false, defaultValue: 'pending' },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      razorpay_order_id: { type: DataTypes.STRING(80), allowNull: true, unique: true },
      razorpay_payment_id: { type: DataTypes.STRING(80), allowNull: true, unique: true },
      reference: { type: DataTypes.STRING(120), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('pos_tenders', ['order_id', 'status']);
    await queryInterface.addIndex('pos_tenders', ['restaurant_id', 'branch_id', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pos_tenders');
    await queryInterface.dropTable('pos_order_requests');
    const [rows] = await queryInterface.sequelize.query('SELECT COUNT(*) AS count FROM orders WHERE customer_id IS NULL');
    if (Number(rows[0]?.count || 0) > 0) throw new Error('Cannot restore required order customer_id while walk-in POS orders exist. Preserve those POS orders or migrate them to customer accounts first.');
    await queryInterface.changeColumn('orders', 'customer_id', {
      type: DataTypes.UUID,
      allowNull: false,
    });
  },
};

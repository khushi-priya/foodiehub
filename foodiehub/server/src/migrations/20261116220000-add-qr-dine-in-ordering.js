'use strict';

const { DataTypes } = require('sequelize');

async function addColumnIfMissing(queryInterface, table, column, definition) {
  const columns = await queryInterface.describeTable(table);
  if (!columns[column]) {
    await queryInterface.addColumn(table, column, definition);
    return;
  }
  if (columns[column].allowNull !== true) throw new Error(`${table}.${column} exists but is not nullable; inspect it before applying the QR dine-in migration.`);
}

async function addIndexIfMissing(queryInterface, table, fields, name) {
  const indexes = await queryInterface.showIndex(table);
  const existing = indexes.find((index) => index.name === name);
  if (!existing) {
    await queryInterface.addIndex(table, fields, { name });
    return;
  }
  const actualFields = existing.fields.map((field) => field.attribute || field.name);
  if (actualFields.join(',') !== fields.join(',')) throw new Error(`Index ${name} exists with unexpected columns on ${table}.`);
}

module.exports = {
  async up(queryInterface) {
    await addColumnIfMissing(queryInterface, 'customer_carts', 'table_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'restaurant_tables', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await addColumnIfMissing(queryInterface, 'customer_carts', 'table_qr_token_hash', {
      type: DataTypes.STRING(64),
      allowNull: true,
    });
    await addColumnIfMissing(queryInterface, 'orders', 'table_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'restaurant_tables', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
    await addIndexIfMissing(queryInterface, 'orders', ['table_id', 'status'], 'orders_table_status_idx');
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('orders', 'orders_table_status_idx');
    await queryInterface.removeColumn('orders', 'table_id');
    await queryInterface.removeColumn('customer_carts', 'table_qr_token_hash');
    await queryInterface.removeColumn('customer_carts', 'table_id');
  },
};

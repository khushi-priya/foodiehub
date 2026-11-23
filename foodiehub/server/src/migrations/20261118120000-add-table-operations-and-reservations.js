'use strict';

const { DataTypes, QueryTypes } = require('sequelize');

async function addColumnIfMissing(queryInterface, table, column, definition) {
  const columns = await queryInterface.describeTable(table);
  if (!columns[column]) await queryInterface.addColumn(table, column, definition);
}

async function addIndexIfMissing(queryInterface, table, fields, name) {
  const indexes = await queryInterface.showIndex(table);
  if (!indexes.some((index) => index.name === name)) await queryInterface.addIndex(table, fields, { name });
}

async function createTableIfMissing(queryInterface, name, definition) {
  const tables = (await queryInterface.showAllTables()).map((table) => String(table).toLowerCase());
  if (!tables.includes(name.toLowerCase())) await queryInterface.createTable(name, definition);
}

module.exports = {
  async up(queryInterface) {
    await addColumnIfMissing(queryInterface, 'restaurant_tables', 'occupancy_status', {
      type: DataTypes.ENUM('available', 'occupied', 'reserved', 'cleaning', 'inactive'),
      allowNull: false,
      defaultValue: 'available',
    });
    await addColumnIfMissing(queryInterface, 'restaurant_tables', 'assigned_waiter_member_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'restaurant_members', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.sequelize.query("UPDATE restaurant_tables SET occupancy_status = 'inactive' WHERE is_active = 0", { type: QueryTypes.UPDATE });
    await addIndexIfMissing(queryInterface, 'restaurant_tables', ['branch_id', 'occupancy_status'], 'restaurant_tables_branch_occupancy_idx');
    await addIndexIfMissing(queryInterface, 'restaurant_tables', ['assigned_waiter_member_id'], 'restaurant_tables_waiter_idx');

    await createTableIfMissing(queryInterface, 'reservations', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      table_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_tables', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      created_by_member_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_members', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      guest_name: { type: DataTypes.STRING(150), allowNull: false },
      guest_phone: { type: DataTypes.STRING(20), allowNull: false },
      guest_email: { type: DataTypes.STRING(150), allowNull: true },
      party_size: { type: DataTypes.INTEGER, allowNull: false },
      starts_at: { type: DataTypes.DATE, allowNull: false },
      ends_at: { type: DataTypes.DATE, allowNull: false },
      status: { type: DataTypes.ENUM('pending', 'confirmed', 'rejected', 'cancelled', 'checked_in', 'seated', 'completed', 'no_show'), allowNull: false, defaultValue: 'pending' },
      notes: { type: DataTypes.TEXT, allowNull: true },
      checked_in_at: { type: DataTypes.DATE, allowNull: true },
      seated_at: { type: DataTypes.DATE, allowNull: true },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await addIndexIfMissing(queryInterface, 'reservations', ['restaurant_id', 'branch_id', 'starts_at', 'status'], 'reservations_branch_schedule_idx');
    await addIndexIfMissing(queryInterface, 'reservations', ['table_id', 'starts_at', 'ends_at', 'status'], 'reservations_table_schedule_idx');

    await createTableIfMissing(queryInterface, 'table_operation_events', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      table_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_tables', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      related_table_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'restaurant_tables', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      order_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      actor_member_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_members', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      operation: { type: DataTypes.ENUM('transfer', 'merge', 'split', 'status', 'waiter_assignment'), allowNull: false },
      metadata: { type: DataTypes.JSON, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await addIndexIfMissing(queryInterface, 'table_operation_events', ['restaurant_id', 'branch_id', 'created_at'], 'table_operations_branch_created_idx');
    await addIndexIfMissing(queryInterface, 'table_operation_events', ['order_id', 'created_at'], 'table_operations_order_created_idx');
  },

  async down(queryInterface) {
    const tables = (await queryInterface.showAllTables()).map((table) => String(table).toLowerCase());
    if (tables.includes('table_operation_events')) await queryInterface.dropTable('table_operation_events');
    if (tables.includes('reservations')) await queryInterface.dropTable('reservations');
    const indexes = await queryInterface.showIndex('restaurant_tables');
    for (const name of ['restaurant_tables_branch_occupancy_idx', 'restaurant_tables_waiter_idx']) {
      if (indexes.some((index) => index.name === name)) await queryInterface.removeIndex('restaurant_tables', name);
    }
    const columns = await queryInterface.describeTable('restaurant_tables');
    for (const column of ['assigned_waiter_member_id', 'occupancy_status']) {
      if (columns[column]) await queryInterface.removeColumn('restaurant_tables', column);
    }
  },
};

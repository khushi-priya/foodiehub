'use strict';

const { DataTypes } = require('sequelize');

async function hasTable(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => String(typeof table === 'string' ? table : table.tableName || table.name).toLowerCase() === tableName.toLowerCase());
}

module.exports = {
  async up(queryInterface) {
    if (!(await hasTable(queryInterface, 'delivery_assignments'))) {
      await queryInterface.createTable('delivery_assignments', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        restaurant_member_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_members', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        assigned_by_user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        status: { type: DataTypes.ENUM('pending_acceptance', 'accepted', 'rejected', 'picked_up', 'on_the_way', 'delivered', 'failed', 'cancelled', 'reassigned'), allowNull: false, defaultValue: 'pending_acceptance' },
        assigned_at: { type: DataTypes.DATE, allowNull: false },
        accepted_at: { type: DataTypes.DATE, allowNull: true },
        completed_at: { type: DataTypes.DATE, allowNull: true },
        notes: { type: DataTypes.STRING(1000), allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex('delivery_assignments', ['restaurant_id', 'branch_id', 'status'], { name: 'delivery_assignments_restaurant_branch_status_idx' });
      await queryInterface.addIndex('delivery_assignments', ['restaurant_member_id', 'status'], { name: 'delivery_assignments_employee_status_idx' });
      await queryInterface.addIndex('delivery_assignments', ['order_id', 'created_at'], { name: 'delivery_assignments_order_created_idx' });
    }

    if (!(await hasTable(queryInterface, 'delivery_status_history'))) {
      await queryInterface.createTable('delivery_status_history', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        assignment_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'delivery_assignments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        restaurant_member_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'restaurant_members', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        performed_by_user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        event: { type: DataTypes.STRING(80), allowNull: false },
        from_status: { type: DataTypes.STRING(40), allowNull: true },
        to_status: { type: DataTypes.STRING(40), allowNull: false },
        notes: { type: DataTypes.STRING(1000), allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex('delivery_status_history', ['restaurant_id', 'order_id', 'created_at'], { name: 'delivery_status_history_restaurant_order_created_idx' });
      await queryInterface.addIndex('delivery_status_history', ['assignment_id', 'created_at'], { name: 'delivery_status_history_assignment_created_idx' });
    }
  },

  async down(queryInterface) {
    if (await hasTable(queryInterface, 'delivery_status_history')) await queryInterface.dropTable('delivery_status_history');
    if (await hasTable(queryInterface, 'delivery_assignments')) await queryInterface.dropTable('delivery_assignments');
  },
};

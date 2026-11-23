'use strict';

const { DataTypes, QueryTypes } = require('sequelize');

async function hasColumn(queryInterface, column) {
  return Boolean((await queryInterface.describeTable('reservations'))[column]);
}

module.exports = {
  async up(queryInterface) {
    if (!(await hasColumn(queryInterface, 'customer_id'))) {
      await queryInterface.addColumn('reservations', 'customer_id', {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
    if (!(await hasColumn(queryInterface, 'rejection_reason'))) {
      await queryInterface.addColumn('reservations', 'rejection_reason', { type: DataTypes.TEXT, allowNull: true });
    }
    // Use MODIFY instead of Sequelize changeColumn here. MySQL changeColumn
    // added a second FK for already constrained columns and retained NOT NULL.
    await queryInterface.sequelize.query('ALTER TABLE `reservations` MODIFY `table_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL');
    await queryInterface.sequelize.query('ALTER TABLE `reservations` MODIFY `created_by_member_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL');
    const indexes = await queryInterface.showIndex('reservations');
    if (!indexes.some((index) => index.name === 'reservations_customer_schedule_idx')) {
      await queryInterface.addIndex('reservations', ['customer_id', 'starts_at', 'status'], { name: 'reservations_customer_schedule_idx' });
    }
  },

  async down(queryInterface) {
    const [counts] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS count FROM reservations WHERE customer_id IS NOT NULL OR table_id IS NULL OR created_by_member_id IS NULL',
      { type: QueryTypes.SELECT },
    );
    if (Number(counts.count) > 0) throw new Error('Cannot roll back customer reservations while customer-owned or unassigned reservations exist.');
    const indexes = await queryInterface.showIndex('reservations');
    if (indexes.some((index) => index.name === 'reservations_customer_schedule_idx')) await queryInterface.removeIndex('reservations', 'reservations_customer_schedule_idx');
    if (await hasColumn(queryInterface, 'rejection_reason')) await queryInterface.removeColumn('reservations', 'rejection_reason');
    if (await hasColumn(queryInterface, 'customer_id')) await queryInterface.removeColumn('reservations', 'customer_id');
    await queryInterface.sequelize.query('ALTER TABLE `reservations` MODIFY `table_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE `reservations` MODIFY `created_by_member_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL');
  },
};

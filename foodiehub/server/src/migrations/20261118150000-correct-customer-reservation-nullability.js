'use strict';

const { QueryTypes } = require('sequelize');

async function removeDuplicateForeignKeys(queryInterface) {
  const constraints = await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME AS constraintName, COLUMN_NAME AS columnName,
            REFERENCED_TABLE_NAME AS referencedTable, REFERENCED_COLUMN_NAME AS referencedColumn
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations'
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY CONSTRAINT_NAME`,
    { type: QueryTypes.SELECT },
  );
  const seen = new Set();
  for (const item of constraints) {
    const key = `${item.columnName}:${item.referencedTable}:${item.referencedColumn}`;
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }
    // Names come directly from information_schema and are escaped as SQL identifiers.
    const safeName = `\`${String(item.constraintName).replaceAll('`', '``')}\``;
    await queryInterface.sequelize.query(`ALTER TABLE \`reservations\` DROP FOREIGN KEY ${safeName}`);
  }
}

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('reservations');
    if (!columns.customer_id || !columns.rejection_reason) {
      throw new Error('Customer reservation migration must run before the nullability correction.');
    }
    if (!columns.table_id.allowNull) {
      await queryInterface.sequelize.query('ALTER TABLE `reservations` MODIFY `table_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL');
    }
    if (!columns.created_by_member_id.allowNull) {
      await queryInterface.sequelize.query('ALTER TABLE `reservations` MODIFY `created_by_member_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL');
    }
    await removeDuplicateForeignKeys(queryInterface);
  },

  async down(queryInterface) {
    const [counts] = await queryInterface.sequelize.query(
      'SELECT SUM(table_id IS NULL) AS nullTables, SUM(created_by_member_id IS NULL) AS nullCreators FROM reservations',
      { type: QueryTypes.SELECT },
    );
    if (Number(counts.nullTables) || Number(counts.nullCreators)) {
      throw new Error('Cannot restore NOT NULL reservation columns while online customer reservations exist.');
    }
    await queryInterface.sequelize.query('ALTER TABLE `reservations` MODIFY `table_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL');
    await queryInterface.sequelize.query('ALTER TABLE `reservations` MODIFY `created_by_member_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL');
  },
};

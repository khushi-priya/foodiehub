'use strict';

module.exports = {
  async up(queryInterface) {
    const [constraints] = await queryInterface.sequelize.query(
      `SELECT CONSTRAINT_NAME AS constraintName
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'support_tickets'
         AND COLUMN_NAME = 'restaurant_id'
         AND REFERENCED_TABLE_NAME = 'restaurants'
       ORDER BY CONSTRAINT_NAME`,
    );
    for (const duplicate of constraints.slice(1)) {
      const safeName = String(duplicate.constraintName).replace(/[^A-Za-z0-9_]/g, '');
      if (safeName) await queryInterface.sequelize.query(`ALTER TABLE support_tickets DROP FOREIGN KEY \`${safeName}\``);
    }
    await queryInterface.sequelize.query('ALTER TABLE support_tickets MODIFY restaurant_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL');
  },

  async down() {
    // Keep nullable tenant ownership so customer tickets remain readable and deletions are not destructive.
  },
};

'use strict';

module.exports = {
  async up(queryInterface) {
    // MySQL's changeColumn can retain the existing NOT NULL definition for
    // this referenced UUID column; ALTER it explicitly so global rows can use NULL.
    await queryInterface.sequelize.query('ALTER TABLE `menu_categories` MODIFY `restaurant_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL');
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE `menu_categories` MODIFY `restaurant_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL');
  },
};

'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('ALTER TABLE support_tickets MODIFY restaurant_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL');
    await queryInterface.changeColumn('support_messages', 'author_type', {
      type: DataTypes.ENUM('restaurant', 'admin', 'customer'),
      allowNull: false,
    });
    const indexes = await queryInterface.showIndex('support_tickets');
    if (!indexes.some((index) => index.name === 'support_tickets_customer_created_idx')) {
      await queryInterface.addIndex('support_tickets', ['created_by_user_id', 'created_at'], {
        name: 'support_tickets_customer_created_idx',
      });
    }
  },

  async down(queryInterface) {
    const [customerMessages] = await queryInterface.sequelize.query(
      "SELECT id FROM support_messages WHERE author_type = 'customer' LIMIT 1",
    );
    const [customerTickets] = await queryInterface.sequelize.query(
      'SELECT id FROM support_tickets WHERE restaurant_id IS NULL LIMIT 1',
    );
    if (customerMessages.length || customerTickets.length) {
      throw new Error('Cannot reverse customer support while customer tickets or replies exist.');
    }
    const indexes = await queryInterface.showIndex('support_tickets');
    if (indexes.some((index) => index.name === 'support_tickets_customer_created_idx')) {
      await queryInterface.removeIndex('support_tickets', 'support_tickets_customer_created_idx');
    }
    await queryInterface.changeColumn('support_messages', 'author_type', { type: DataTypes.ENUM('restaurant', 'admin'), allowNull: false });
    await queryInterface.sequelize.query('ALTER TABLE support_tickets MODIFY restaurant_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL');
  },
};

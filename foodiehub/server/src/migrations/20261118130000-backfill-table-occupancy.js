'use strict';

const { QueryTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE restaurant_tables AS rt
       SET occupancy_status = 'inactive'
       WHERE rt.is_active = 0`,
      { type: QueryTypes.UPDATE }
    );
    await queryInterface.sequelize.query(
      `UPDATE restaurant_tables AS rt
       SET occupancy_status = 'occupied'
       WHERE rt.is_active = 1
         AND EXISTS (
           SELECT 1 FROM orders AS o
           WHERE o.table_id = rt.id
             AND o.order_type = 'dine_in'
             AND o.status IN ('pending', 'accepted', 'preparing', 'ready')
             AND o.payment_status <> 'failed'
         )`,
      { type: QueryTypes.UPDATE }
    );
    await queryInterface.sequelize.query(
      `UPDATE restaurant_tables AS rt
       SET occupancy_status = 'reserved'
       WHERE rt.is_active = 1
         AND rt.occupancy_status = 'available'
         AND EXISTS (
           SELECT 1 FROM reservations AS r
           WHERE r.table_id = rt.id
             AND r.status IN ('confirmed', 'checked_in')
             AND r.ends_at > CURRENT_TIMESTAMP
         )`,
      { type: QueryTypes.UPDATE }
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "UPDATE restaurant_tables SET occupancy_status = IF(is_active = 1, 'available', 'inactive')",
      { type: QueryTypes.UPDATE }
    );
  },
};

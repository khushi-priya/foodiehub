'use strict';

const { QueryTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    // Only repair records with current assignment evidence that contradicts the
    // completed order status. Historical completed orders without an active
    // assignment are left unchanged because their outcome cannot be inferred.
    const inconsistent = await queryInterface.sequelize.query(
      `SELECT o.id AS order_id, o.restaurant_id, o.branch_id, o.accepted_at,
              COALESCE(o.updated_at, o.created_at) AS recovered_at,
              CASE
                WHEN MAX(CASE WHEN da.status IN ('picked_up','on_the_way','at_customer') THEN 1 ELSE 0 END) = 1 THEN 'out_for_delivery'
                ELSE 'accepted'
              END AS recovered_status,
              CASE
                WHEN MAX(CASE WHEN da.status IN ('picked_up','on_the_way','at_customer') THEN 1 ELSE 0 END) = 1 THEN 'handed_over'
                ELSE COALESCE(o.kitchen_status, 'queued')
              END AS recovered_kitchen_status,
              (SELECT rm.user_id FROM restaurant_members rm JOIN roles r ON r.id = rm.role_id
               WHERE rm.restaurant_id = o.restaurant_id AND rm.status = 'active'
                 AND r.code = 'restaurant_owner' ORDER BY rm.created_at ASC LIMIT 1) AS actor_id
       FROM orders o
       JOIN delivery_assignments da ON da.order_id = o.id AND da.restaurant_id = o.restaurant_id
       WHERE o.order_type = 'delivery' AND o.status = 'completed'
         AND da.status IN ('pending_acceptance','accepted','arriving_at_restaurant','at_restaurant','picked_up','on_the_way','at_customer')
         AND NOT EXISTS (SELECT 1 FROM delivery_assignments delivered
                         WHERE delivered.order_id = o.id AND delivered.restaurant_id = o.restaurant_id
                           AND delivered.status = 'delivered')
       GROUP BY o.id, o.restaurant_id, o.branch_id, o.accepted_at, o.updated_at, o.created_at, o.kitchen_status`,
      { type: QueryTypes.SELECT },
    );

    for (const row of inconsistent) {
      await queryInterface.sequelize.query(
        `UPDATE orders SET status = :status, kitchen_status = :kitchenStatus,
                           completed_at = NULL, delivery_otp_hash = NULL,
                           delivery_otp_expires_at = NULL
         WHERE id = :orderId AND restaurant_id = :restaurantId AND status = 'completed'`,
        { replacements: { orderId: row.order_id, restaurantId: row.restaurant_id, status: row.recovered_status, kitchenStatus: row.recovered_kitchen_status } },
      );

      if (row.actor_id && row.recovered_kitchen_status === 'queued') {
        await queryInterface.bulkInsert('kitchen_status_history', [{
          id: require('node:crypto').randomUUID(),
          restaurant_id: row.restaurant_id,
          branch_id: row.branch_id,
          order_id: row.order_id,
          from_status: null,
          to_status: 'queued',
          performed_by_user_id: row.actor_id,
          notes: 'Recovered from a completed order status while an undelivered active assignment existed.',
          created_at: row.accepted_at || row.recovered_at,
          updated_at: row.accepted_at || row.recovered_at,
        }]);
      }
    }
  },

  async down() {
    // Keep corrected operational records safe during rollback. Re-marking them
    // completed would recreate the invalid state this migration repairs.
  },
};

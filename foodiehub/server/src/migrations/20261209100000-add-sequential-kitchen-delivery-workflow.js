'use strict';
const { DataTypes, QueryTypes } = require('sequelize');

const assignmentStatus = DataTypes.ENUM('pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant', 'rejected', 'timed_out', 'picked_up', 'on_the_way', 'at_customer', 'delivered', 'failed', 'cancelled', 'reassigned');
const previousAssignmentStatus = DataTypes.ENUM('pending_acceptance', 'accepted', 'arriving_at_restaurant', 'rejected', 'picked_up', 'on_the_way', 'delivered', 'failed', 'cancelled', 'reassigned');
const orderStatus = DataTypes.ENUM('pending', 'accepted', 'rejected', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled');
const previousOrderStatus = DataTypes.ENUM('pending', 'accepted', 'rejected', 'preparing', 'ready', 'completed', 'cancelled');

module.exports = {
  async up(queryInterface) {
    await queryInterface.changeColumn('orders', 'status', { type: orderStatus, allowNull: false, defaultValue: 'pending' });
    await queryInterface.addColumn('orders', 'kitchen_status', { type: DataTypes.ENUM('queued', 'preparing', 'ready', 'handed_over'), allowNull: true });
    await queryInterface.addColumn('orders', 'delivery_otp_hash', { type: DataTypes.STRING(64), allowNull: true });
    await queryInterface.addColumn('orders', 'delivery_otp_expires_at', { type: DataTypes.DATE, allowNull: true });
    await queryInterface.sequelize.query("UPDATE orders SET kitchen_status = CASE WHEN status = 'ready' THEN 'ready' WHEN status = 'preparing' THEN 'preparing' WHEN status = 'accepted' THEN 'queued' ELSE NULL END WHERE order_type = 'delivery'");
    await queryInterface.changeColumn('delivery_assignments', 'status', { type: assignmentStatus, allowNull: false, defaultValue: 'pending_acceptance' });
    await queryInterface.addColumn('cod_collections', 'resolution_status', { type: DataTypes.ENUM('unresolved', 'resolved'), allowNull: false, defaultValue: 'unresolved' });
    await queryInterface.addColumn('cod_collections', 'resolution_reason', { type: DataTypes.STRING(1000), allowNull: true });
    await queryInterface.addColumn('cod_collections', 'resolved_by_user_id', { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
    await queryInterface.addColumn('cod_collections', 'resolved_at', { type: DataTypes.DATE, allowNull: true });
    await queryInterface.createTable('kitchen_status_history', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      from_status: { type: DataTypes.STRING(30), allowNull: true },
      to_status: { type: DataTypes.ENUM('queued', 'preparing', 'ready', 'handed_over'), allowNull: false },
      performed_by_user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      notes: { type: DataTypes.STRING(1000), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('kitchen_status_history', ['restaurant_id', 'order_id', 'created_at'], { name: 'kitchen_history_restaurant_order_date_idx' });
    await queryInterface.addIndex('kitchen_status_history', ['branch_id', 'to_status', 'created_at'], { name: 'kitchen_history_branch_status_date_idx' });
    const orderRows = await queryInterface.sequelize.query("SELECT o.id, o.restaurant_id, o.branch_id, o.status, o.accepted_at, o.updated_at, (SELECT rm.user_id FROM restaurant_members rm JOIN roles r ON r.id = rm.role_id WHERE rm.restaurant_id = o.restaurant_id AND rm.status = 'active' AND r.code = 'restaurant_owner' ORDER BY rm.created_at ASC LIMIT 1) AS actor_id FROM orders o WHERE o.order_type = 'delivery' AND o.status IN ('accepted','preparing','ready')", { type: QueryTypes.SELECT });
    for (const order of orderRows) {
      if (!order.actor_id) continue;
      const stages = order.status === 'ready' ? ['queued', 'preparing', 'ready'] : order.status === 'preparing' ? ['queued', 'preparing'] : ['queued'];
      for (const stage of stages) await queryInterface.bulkInsert('kitchen_status_history', [{ id: require('node:crypto').randomUUID(), restaurant_id: order.restaurant_id, branch_id: order.branch_id, order_id: order.id, from_status: null, to_status: stage, performed_by_user_id: order.actor_id, notes: 'Backfilled from the existing order preparation status; actor attributed to restaurant owner.', created_at: order.accepted_at || order.updated_at, updated_at: order.accepted_at || order.updated_at }]);
    }
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query("UPDATE orders SET status = 'ready' WHERE status = 'out_for_delivery'");
    await queryInterface.changeColumn('orders', 'status', { type: previousOrderStatus, allowNull: false, defaultValue: 'pending' });
    await queryInterface.sequelize.query("UPDATE delivery_assignments SET status = CASE WHEN status = 'at_restaurant' THEN 'arriving_at_restaurant' WHEN status = 'at_customer' THEN 'on_the_way' WHEN status = 'timed_out' THEN 'rejected' ELSE status END WHERE status IN ('at_restaurant','at_customer','timed_out')");
    await queryInterface.changeColumn('delivery_assignments', 'status', { type: previousAssignmentStatus, allowNull: false, defaultValue: 'pending_acceptance' });
    await queryInterface.removeColumn('cod_collections', 'resolved_at');
    await queryInterface.removeColumn('cod_collections', 'resolved_by_user_id');
    await queryInterface.removeColumn('cod_collections', 'resolution_reason');
    await queryInterface.removeColumn('cod_collections', 'resolution_status');
    await queryInterface.dropTable('kitchen_status_history');
    await queryInterface.removeColumn('orders', 'delivery_otp_expires_at');
    await queryInterface.removeColumn('orders', 'delivery_otp_hash');
    await queryInterface.removeColumn('orders', 'kitchen_status');
  },
};

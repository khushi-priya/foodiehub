'use strict';

const { Op } = require('sequelize');
const { RestaurantMember, Role, Permission, EmployeeBranchAssignment, RestaurantNotification } = require('../models');

const EVENT_PERMISSIONS = {
  orders: ['orders.view', 'orders.manage', 'orders.manage_status'],
  kitchen: ['orders.kitchen', 'kitchen.update_status', 'orders.view'],
  reservations: ['reservations.view', 'reservations.manage'],
  delivery: ['delivery_orders.view', 'delivery_orders.view_assigned', 'delivery_assignments.view'],
  payments: ['payments.view', 'payments.transactions.view'],
  staff: ['employees.view', 'employees.manage'],
  branch: ['branches.view', 'branches.manage'],
};

function publish(app, notification, io) {
  (app?.get?.('io') || io)?.to(`restaurant-notifications:${notification.restaurantId}:${notification.restaurantMemberId}`)?.emit('restaurant:notification', notification);
}

async function createRestaurantNotification({ app, io, restaurantId, branchId = null, category, title, message, href = null, entityId = null, dedupeKey = null, transaction = null }) {
  const allowedHref = typeof href === 'string' && /^\/restaurant\/(orders|kitchen|reservations|delivery|payments|employees|branches|menu|tables)(\/|\?|$)/.test(href) ? href.slice(0, 255) : null;
  const required = EVENT_PERMISSIONS[category];
  if (!restaurantId || !required || !title || !message) return [];
  const members = await RestaurantMember.findAll({
    where: { restaurantId, status: 'active' },
    attributes: ['id'],
    include: [
      { model: Role, as: 'role', attributes: ['code'], required: true, include: [{ model: Permission, as: 'permissions', where: { code: { [Op.in]: required } }, attributes: ['code'], through: { attributes: [] }, required: false }] },
      { model: EmployeeBranchAssignment, as: 'branchAssignments', where: { status: 'active' }, attributes: ['branchId'], required: false },
    ],
    transaction,
  });
  const eligible = members.filter((member) => {
    const hasPermission = member.role.code === 'restaurant_owner' || member.role.permissions?.length > 0;
    const hasBranch = !branchId || member.role.code === 'restaurant_owner' || member.branchAssignments?.some((entry) => entry.branchId === branchId);
    return hasPermission && hasBranch;
  });
  const created = [];
  for (const member of eligible) {
    const key = dedupeKey ? `${String(dedupeKey).slice(0, 130)}:${member.id}` : null;
    let row;
    let wasCreated = true;
    if (key) [row, wasCreated] = await RestaurantNotification.findOrCreate({ where: { restaurantMemberId: member.id, dedupeKey: key }, defaults: { restaurantId, branchId, restaurantMemberId: member.id, category, title: String(title).slice(0, 150), message: String(message).slice(0, 500), href: allowedHref, entityId: entityId == null ? null : String(entityId).slice(0, 80) }, ...(transaction ? { transaction } : {}) });
    else row = await RestaurantNotification.create({ restaurantId, branchId, restaurantMemberId: member.id, category, title: String(title).slice(0, 150), message: String(message).slice(0, 500), href: allowedHref, entityId: entityId == null ? null : String(entityId).slice(0, 80) }, transaction ? { transaction } : {});
    if (wasCreated) {
      const data = row.toJSON();
      if (transaction?.afterCommit) transaction.afterCommit(() => publish(app, data, io));
      else publish(app, data, io);
      created.push(row);
    }
  }
  return created;
}

module.exports = { createRestaurantNotification, EVENT_PERMISSIONS };

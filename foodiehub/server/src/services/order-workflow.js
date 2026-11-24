'use strict';

const fail = (status, code, message, currentStatus, requiredStatus) => Object.assign(new Error(message), { status, code, currentStatus, requiredStatus });

const orderTransitions = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['picked_up', 'completed', 'cancelled'],
  picked_up: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  rejected: [],
  completed: [],
  cancelled: [],
};

const kitchenTransitions = { queued: ['preparing'], preparing: ['ready'], ready: ['handed_over'], handed_over: [] };

const deliveryTransitions = {
  accept: { from: 'pending_acceptance', to: 'accepted', permission: 'delivery_orders.accept' },
  reject: { from: 'pending_acceptance', to: 'rejected', permission: 'delivery_orders.reject' },
  arriving_at_restaurant: { from: 'accepted', to: 'arriving_at_restaurant', permission: 'delivery_orders.update_status' },
  at_restaurant: { from: 'arriving_at_restaurant', to: 'at_restaurant', permission: 'delivery_orders.update_status' },
  picked_up: { from: 'at_restaurant', to: 'picked_up', permission: 'delivery_orders.update_status' },
  on_the_way: { from: 'picked_up', to: 'on_the_way', permission: 'delivery_orders.update_status' },
  at_customer: { from: 'on_the_way', to: 'at_customer', permission: 'delivery_orders.update_status' },
  delivered: { from: 'at_customer', to: 'delivered', permission: 'delivery_orders.complete' },
  failed: { from: ['accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer'], to: 'failed', permission: 'delivery_orders.update_status' },
};

function assertOrderTransition(order, nextStatus) {
  if (nextStatus === 'completed' && order.orderType === 'delivery') throw fail(409, 'DELIVERY_CONFIRMATION_REQUIRED', 'Delivery orders can only be completed after the assigned associate confirms delivery.', order.status, 'verified delivery');
  if (!(orderTransitions[order.status] || []).includes(nextStatus)) throw fail(409, 'INVALID_ORDER_TRANSITION', `Order cannot be changed from ${order.status} to ${nextStatus}.`, order.status, (orderTransitions[order.status] || [])[0] || null);
}

function assertKitchenTransition(currentStatus, nextStatus) {
  if (nextStatus === 'queued' && currentStatus == null) return;
  if (!(kitchenTransitions[currentStatus] || []).includes(nextStatus)) throw fail(409, 'INVALID_KITCHEN_TRANSITION', `Kitchen status cannot be changed from ${currentStatus || 'not queued'} to ${nextStatus}.`, currentStatus || null, (kitchenTransitions[currentStatus] || [])[0] || null);
}

function deliveryTransition(action) { return deliveryTransitions[action] || null; }

function assertSingleActiveDelivery(otherAssignments = []) {
  const active = otherAssignments.find((assignment) => assignment && assignment.status !== 'pending_acceptance');
  if (active) throw fail(409, 'ACTIVE_DELIVERY_EXISTS', 'Another associate already has an active assignment for this order. Refresh your assignments.', active.status, 'one active assignment');
  return otherAssignments.filter((assignment) => assignment?.status === 'pending_acceptance');
}

module.exports = { assertOrderTransition, assertKitchenTransition, deliveryTransition, assertSingleActiveDelivery, orderTransitions, kitchenTransitions, deliveryTransitions };

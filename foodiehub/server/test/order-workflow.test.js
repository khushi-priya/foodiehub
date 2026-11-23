'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertOrderTransition, assertKitchenTransition, deliveryTransition, assertSingleActiveDelivery } = require('../src/services/order-workflow');

test('delivery order cannot be completed through the restaurant order status endpoint', () => {
  assert.throws(
    () => assertOrderTransition({ status: 'ready', orderType: 'delivery' }, 'completed'),
    (error) => error.status === 409 && error.code === 'DELIVERY_CONFIRMATION_REQUIRED',
  );
});

test('restaurant dine-in order completion remains valid after ready', () => {
  assert.doesNotThrow(() => assertOrderTransition({ status: 'ready', orderType: 'dine_in' }, 'completed'));
});

test('kitchen stages enforce queued, preparing, ready, then handover sequence', () => {
  assert.doesNotThrow(() => assertKitchenTransition(null, 'queued'));
  assert.doesNotThrow(() => assertKitchenTransition('queued', 'preparing'));
  assert.doesNotThrow(() => assertKitchenTransition('preparing', 'ready'));
  assert.doesNotThrow(() => assertKitchenTransition('ready', 'handed_over'));
  assert.throws(() => assertKitchenTransition('queued', 'ready'), (error) => error.code === 'INVALID_KITCHEN_TRANSITION');
});

test('delivery actions expose only sequential valid source statuses', () => {
  assert.deepEqual(deliveryTransition('at_restaurant'), { from: 'arriving_at_restaurant', to: 'at_restaurant', permission: 'delivery_orders.update_status' });
  assert.equal(deliveryTransition('picked_up').from, 'at_restaurant');
  assert.equal(deliveryTransition('at_customer').from, 'on_the_way');
  assert.equal(deliveryTransition('delivered').from, 'at_customer');
  assert.equal(deliveryTransition('unknown'), null);
});

test('only competing pending attempts may be closed when an associate accepts', () => {
  const pending = [{ id: 'pending-a', status: 'pending_acceptance' }, { id: 'pending-b', status: 'pending_acceptance' }];
  assert.deepEqual(assertSingleActiveDelivery(pending), pending);
  assert.throws(
    () => assertSingleActiveDelivery([...pending, { id: 'accepted', status: 'accepted' }]),
    (error) => error.status === 409 && error.code === 'ACTIVE_DELIVERY_EXISTS' && error.currentStatus === 'accepted',
  );
});

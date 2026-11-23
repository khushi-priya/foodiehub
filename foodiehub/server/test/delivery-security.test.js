const test = require('node:test');
const assert = require('node:assert/strict');
const { DeliveryAssignment } = require('../src/models');
const deliveryOrders = require('../src/modules/restaurants/delivery-orders.controller');
const { invalidateRestaurantSockets, rejectClientRoomSubscriptions, restaurantRoomsForMembership } = require('../src/services/socket-auth');

test('delivery reports constrain assignments, branches, and employees to the authenticated tenant', async (t) => {
  const originalFindAll = DeliveryAssignment.findAll;
  let capturedOptions;
  DeliveryAssignment.findAll = async (options) => { capturedOptions = options; return []; };
  t.after(() => { DeliveryAssignment.findAll = originalFindAll; });

  let responseBody;
  let nextError;
  const req = { restaurant: { id: 'restaurant-a' }, restaurantBranchIds: ['branch-a'], query: { period: 'last7' } };
  const res = { json: (body) => { responseBody = body; } };
  await deliveryOrders.reports(req, res, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.equal(responseBody.success, true);
  assert.equal(capturedOptions.where.restaurantId, 'restaurant-a');
  assert.deepEqual(capturedOptions.where.branchId, { [require('sequelize').Op.in]: ['branch-a'] });
  assert.equal(capturedOptions.include.find((entry) => entry.as === 'branch').where.restaurantId, 'restaurant-a');
  assert.equal(capturedOptions.include.find((entry) => entry.as === 'deliveryEmployee').where.restaurantId, 'restaurant-a');
});

test('delivery reports reject a branch outside the authenticated employee branch scope', async (t) => {
  const originalFindAll = DeliveryAssignment.findAll;
  let queried = false;
  DeliveryAssignment.findAll = async () => { queried = true; return []; };
  t.after(() => { DeliveryAssignment.findAll = originalFindAll; });

  let nextError;
  const req = { restaurant: { id: 'restaurant-a' }, restaurantBranchIds: ['branch-a'], query: { period: 'last7', branchId: 'branch-b' } };
  await deliveryOrders.reports(req, { json() {} }, (error) => { nextError = error; });
  assert.equal(nextError?.status, 403);
  assert.equal(queried, false);
});

test('client socket room subscription requests are rejected without joining the requested room', () => {
  const handlers = new Map(); let joinedRoom = null; let acknowledgement;
  const socket = { on: (event, handler) => handlers.set(event, handler), join: (room) => { joinedRoom = room; } };
  rejectClientRoomSubscriptions(socket);
  handlers.get('join-delivery-room')('delivery:restaurant-b:branch-b', (value) => { acknowledgement = value; });
  assert.equal(joinedRoom, null);
  assert.deepEqual(acknowledgement, { success: false, message: 'Room subscriptions are managed by the server.' });
});

test('restaurant permission changes disconnect existing sockets before they can keep receiving scoped events', () => {
  let roomName; let forceDisconnect;
  const io = { in: (room) => { roomName = room; return { disconnectSockets: (force) => { forceDisconnect = force; } }; } };
  invalidateRestaurantSockets(io, 'restaurant-a');
  assert.equal(roomName, 'restaurant-membership:restaurant-a');
  assert.equal(forceDisconnect, true);
});

test('socket rooms are limited to authorized branches and live tracking permission', () => {
  const membership = { id: 'member-a', restaurantId: 'restaurant-a', role: { permissions: [{ code: 'delivery_orders.view' }] } };
  const rooms = restaurantRoomsForMembership(membership, new Set(['branch-a']));
  assert.ok(rooms.includes('delivery:restaurant-a:branch-a'));
  assert.ok(!rooms.includes('delivery-tracking:restaurant-a:branch-a'));
  assert.ok(!rooms.includes('delivery:restaurant-b:branch-b'));
  membership.role.permissions.push({ code: 'delivery_tracking.view_branch' });
  assert.ok(restaurantRoomsForMembership(membership, new Set(['branch-a'])).includes('delivery-tracking:restaurant-a:branch-a'));
});


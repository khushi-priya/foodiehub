'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DeliveryAssignment, DeliverySetting, DeliveryLocation } = require('../src/models');
const locationController = require('../src/modules/restaurants/delivery-location.controller');

test('location sharing excludes unaccepted assignments', async (t) => {
  const originalFindAll = DeliveryAssignment.findAll;
  let query;
  DeliveryAssignment.findAll = async (options) => { query = options; return []; };
  t.after(() => { DeliveryAssignment.findAll = originalFindAll; });

  let nextError;
  await locationController.updateLocation({
    body: { latitude: 25.68, longitude: 85.21 },
    restaurant: { id: 'restaurant-a' },
    restaurantMembership: { id: 'member-a', status: 'active', availabilityStatus: 'available' },
    restaurantBranchIds: ['branch-a'],
  }, { json() {} }, (error) => { nextError = error; });

  assert.deepEqual(query.where.status[require('sequelize').Op.in], ['accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer']);
  assert.equal(nextError?.status, 409);
  assert.match(nextError?.message, /active delivery assignment/);
});

test('valid location updates expire after two minutes and publish only to scoped rooms', async (t) => {
  const originals = {
    findAll: DeliveryAssignment.findAll,
    findOne: DeliverySetting.findOne,
    findOrCreate: DeliveryLocation.findOrCreate,
  };
  const assignment = {
    id: 'assignment-a', orderId: 'order-a', branchId: 'branch-a',
    getOrder: async () => ({ customerId: 'customer-a' }),
  };
  DeliveryAssignment.findAll = async () => [assignment];
  DeliverySetting.findOne = async () => ({ locationSharingEnabled: true });
  let saved;
  DeliveryLocation.findOrCreate = async ({ defaults }) => {
    saved = { ...defaults };
    return [{ update: async (changes) => Object.assign(saved, changes) }];
  };
  t.after(() => {
    DeliveryAssignment.findAll = originals.findAll;
    DeliverySetting.findOne = originals.findOne;
    DeliveryLocation.findOrCreate = originals.findOrCreate;
  });

  const emitted = [];
  const io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
  let response;
  let nextError;
  await locationController.updateLocation({
    body: { latitude: 25.68, longitude: 85.21, accuracyMeters: 12 },
    restaurant: { id: 'restaurant-a' },
    restaurantMembership: { id: 'member-a', status: 'active', availabilityStatus: 'on_delivery' },
    restaurantBranchIds: ['branch-a'],
    app: { get: () => io },
  }, { json: (body) => { response = body; } }, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.equal(response.success, true);
  assert.equal(new Date(saved.expiresAt).getTime() - new Date(saved.capturedAt).getTime(), 120000);
  assert.deepEqual(emitted.map((item) => item.room), ['customer:customer-a', 'delivery-tracking:restaurant-a:branch-a']);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { Restaurant, Branch, User, AuditLog } = require('../src/models');
const settings = require('../src/modules/restaurants/settings.controller');
const business = require('../src/modules/restaurants/business.controller');

test('settings aggregate is scoped to the authenticated restaurant and assigned branches', async (t) => {
  const originals = { restaurant: Restaurant.findByPk, branches: Branch.findAll, user: User.findByPk };
  let restaurantId;
  let branchWhere;
  Restaurant.findByPk = async (id) => { restaurantId = id; return { id, name: 'Restaurant A' }; };
  Branch.findAll = async (options) => { branchWhere = options.where; return [{ id: 'branch-a', razorpayEnabled: true }]; };
  User.findByPk = async () => ({ id: 'user-a', email: 'owner@example.test', lastLoginAt: null });
  t.after(() => { Restaurant.findByPk = originals.restaurant; Branch.findAll = originals.branches; User.findByPk = originals.user; });

  let body;
  let error;
  await settings.getSettings({ restaurant: { id: 'restaurant-a' }, restaurantBranchIds: ['branch-a'], authUser: { id: 'user-a' }, session: {} }, { json: (value) => { body = value; } }, (value) => { error = value; });

  assert.equal(error, undefined);
  assert.equal(restaurantId, 'restaurant-a');
  assert.deepEqual(branchWhere, { restaurantId: 'restaurant-a', id: { [Op.in]: ['branch-a'] } });
  assert.deepEqual(body.branches.map((branch) => branch.id), ['branch-a']);
});

test('integration statuses disclose configuration state without returning gateway credentials', async (t) => {
  const originals = { restaurant: Restaurant.findByPk, branches: Branch.findAll, user: User.findByPk };
  const originalKeyId = process.env.RAZORPAY_KEY_ID;
  const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = 'private-key-id';
  process.env.RAZORPAY_KEY_SECRET = 'private-key-secret';
  Restaurant.findByPk = async (id) => ({ id, name: 'Restaurant A' });
  Branch.findAll = async () => [];
  User.findByPk = async () => null;
  t.after(() => {
    Restaurant.findByPk = originals.restaurant;
    Branch.findAll = originals.branches;
    User.findByPk = originals.user;
    if (originalKeyId === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = originalKeyId;
    if (originalKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
  });

  let body;
  let error;
  await settings.getSettings({ restaurant: { id: 'restaurant-a' }, restaurantBranchIds: null, authUser: { id: 'user-a' }, session: {} }, { json: (value) => { body = value; } }, (value) => { error = value; });
  assert.equal(error, undefined);
  assert.equal(body.integrations.razorpay.status, 'configured');
  assert.equal(JSON.stringify(body).includes('private-key-id'), false);
  assert.equal(JSON.stringify(body).includes('private-key-secret'), false);
});

test('profile API rejects unsupported fields before updating restaurant data', async () => {
  let error;
  await business.updateProfile({ restaurant: { id: 'restaurant-a' }, body: { name: 'Restaurant A', website: 'https://example.test' } }, { json() {} }, (value) => { error = value; });
  assert.equal(error?.status, 400);
  assert.match(error.message, /Unsupported profile fields/);
});

test('profile update loads the authenticated restaurant primary key and saves all supported fields', async (t) => {
  const originalFindByPk = Restaurant.findByPk;
  const originalCreate = Restaurant.create;
  const originalAuditCreate = AuditLog.create;
  const fields = { name: 'Restaurant A Updated', email: 'updated@example.test', phone: '+91 9876543210', logo: 'https://images.example.test/logo.png', description: 'Updated description' };
  const record = { id: 'restaurant-a', name: 'Restaurant A', email: 'owner@example.test', phone: '+91 9000000000', logo: null, description: 'Original description', toJSON() { return { id: this.id, name: this.name, email: this.email, phone: this.phone, logo: this.logo, description: this.description }; }, async update(updates) { Object.assign(this, updates); return this; } };
  let fetchedId;
  let fetchedAttributes;
  let createCalls = 0;
  Restaurant.findByPk = async (id, options) => { fetchedId = id; fetchedAttributes = options.attributes; return record; };
  Restaurant.create = async () => { createCalls += 1; throw new Error('Unexpected restaurant creation'); };
  AuditLog.create = async () => ({ id: 'audit-1' });
  t.after(() => { Restaurant.findByPk = originalFindByPk; Restaurant.create = originalCreate; AuditLog.create = originalAuditCreate; });

  let response;
  let error;
  await business.updateProfile({ restaurant: { id: 'restaurant-a' }, authUser: { id: 'owner-a' }, restaurantRole: 'restaurant_owner', body: { ...fields } }, { json: (body) => { response = body; } }, (value) => { error = value; });

  assert.equal(error, undefined);
  assert.equal(fetchedId, 'restaurant-a');
  assert.ok(fetchedAttributes.includes(Restaurant.primaryKeyAttribute));
  assert.equal(record.id, 'restaurant-a');
  assert.equal(response.restaurant.name, fields.name);
  assert.equal(response.restaurant.email, fields.email);
  assert.equal(response.restaurant.phone, fields.phone);
  assert.equal(response.restaurant.logo, fields.logo);
  assert.equal(response.restaurant.description, fields.description);
  assert.equal(createCalls, 0);
});

test('profile update returns 404 without saving when the authenticated restaurant no longer exists', async (t) => {
  const originalFindByPk = Restaurant.findByPk;
  Restaurant.findByPk = async (id) => { assert.equal(id, 'restaurant-a'); return null; };
  t.after(() => { Restaurant.findByPk = originalFindByPk; });

  let error;
  await business.updateProfile({ restaurant: { id: 'restaurant-a' }, body: { name: 'Restaurant A' } }, { json() {} }, (value) => { error = value; });
  assert.equal(error?.status, 404);
  assert.equal(error?.message, 'Restaurant not found.');
});

test('profile update rejects non-HTTPS or malformed logo URLs and client-supplied tenant fields', async () => {
  let error;
  await business.updateProfile({ restaurant: { id: 'restaurant-a' }, body: { logo: 'http://images.example.test/logo.png' } }, { json() {} }, (value) => { error = value; });
  assert.equal(error?.status, 400);
  assert.match(error.message, /HTTPS/);

  error = undefined;
  await business.updateProfile({ restaurant: { id: 'restaurant-a' }, body: { name: 'Restaurant A', restaurantId: 'restaurant-b' } }, { json() {} }, (value) => { error = value; });
  assert.equal(error?.status, 400);
  assert.match(error.message, /Unsupported profile fields/);
});

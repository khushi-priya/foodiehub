require('dotenv').config();
const assert = require('node:assert/strict');
const { User, Restaurant, MenuCategory, MenuItem, FoodCategoryRequest, FoodCategoryRequestHistory, AuditLog } = require('../src/models');
const ownerController = require('../src/modules/restaurants/menu.controller');
const adminController = require('../src/modules/admin/food-category.controller');
const requireSuperAdmin = require('../src/middleware/requireSuperAdmin');

async function call(handler, req) {
  return new Promise((resolve, reject) => handler(req, { status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code || 200, body }); } }, reject));
}
function ownerReq(user, restaurant, body = {}, params = {}) { return { authUser: user, restaurant, body, params, query: {}, get: () => 'category-smoke-test', headers: {}, ip: '127.0.0.1' }; }

(async () => {
  const users = [];
  const restaurants = [];
  const categoryIds = [];
  try {
    const makeUser = async (name) => { const user = await User.create({ firstName: name, lastName: 'Smoke', email: `${name}.${Date.now()}.${Math.random()}@example.org`, passwordHash: 'not-used', status: 'active' }); users.push(user); return user; };
    const makeRestaurant = async (name) => { const restaurant = await Restaurant.create({ name, slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, email: `${name.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@example.org`, phone: `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` }); restaurants.push(restaurant); return restaurant; };
    const [admin, ownerA, ownerB] = await Promise.all([makeUser('Admin'), makeUser('OwnerA'), makeUser('OwnerB')]);
    const [restaurantA, restaurantB] = await Promise.all([makeRestaurant('Category Test A'), makeRestaurant('Category Test B')]);
    const global = await call(adminController.createCategory, { user: admin, body: { name: `Smoke Pizza ${Date.now()}`, description: 'Global smoke category', imageUrl: null } });
    assert.equal(global.code, 201); assert.equal(global.body.data.scope, 'global'); categoryIds.push(global.body.data.id);
    const globalCategory = global.body.data;
    for (const [owner, restaurant] of [[ownerA, restaurantA], [ownerB, restaurantB]]) {
      const itemResult = await call(ownerController.createItem, ownerReq(owner, restaurant, { name: 'Pizza smoke item', price: '10.00', categoryId: globalCategory.id }));
      assert.equal(itemResult.code, 201);
    }
    for (const [owner, restaurant] of [[ownerA, restaurantA], [ownerB, restaurantB]]) {
      const allowed = await call(ownerController.listCategories, ownerReq(owner, restaurant));
      assert(allowed.body.data.some((category) => category.id === globalCategory.id));
    }
    const ownerActivation = await call(ownerController.categoryStatus, ownerReq(ownerA, restaurantA, { isActive: false }, { categoryId: globalCategory.id })).catch((error) => error);
    assert.equal(ownerActivation.status, 403);
    const submitted = await call(ownerController.createCategory, ownerReq(ownerA, restaurantA, { name: `Smoke Cheese ${Date.now()}`, description: 'Pending', imageUrl: null, status: 'approved', restaurantId: restaurantB.id }));
    assert.equal(submitted.code, 201); assert.equal(submitted.body.data.status, 'pending');
    assert.equal(submitted.body.data.restaurantId, restaurantA.id);
    const requestId = submitted.body.data.id;
    assert.equal((await call(ownerController.summary, ownerReq(ownerA, restaurantA))).body.data.pendingRequests, 1);
    const duplicateRequest = await call(ownerController.createCategory, ownerReq(ownerA, restaurantA, { name: submitted.body.data.name })).catch((error) => error);
    assert.equal(duplicateRequest.status, 409);
    const own = await call(ownerController.listCategoryRequests, ownerReq(ownerA, restaurantA));
    const other = await call(ownerController.listCategoryRequests, ownerReq(ownerB, restaurantB));
    assert(own.body.data.some((request) => request.id === requestId)); assert(!other.body.data.some((request) => request.id === requestId));
    const adminList = await call(adminController.listRequests, { query: { status: 'pending' } });
    assert(adminList.body.data.items.some((request) => request.id === requestId));
    const pendingItem = await call(ownerController.createItem, ownerReq(ownerA, restaurantA, { name: 'Pending category item', price: '10.00', categoryId: requestId })).catch((error) => error);
    assert.equal(pendingItem.status, 400);
    const approved = await call(adminController.approveRequest('global'), { user: admin, params: { requestId }, body: {} });
    assert.equal(approved.body.data.request.status, 'approved'); assert.equal(approved.body.data.category.scope, 'global'); categoryIds.push(approved.body.data.category.id);
    assert.equal((await call(ownerController.summary, ownerReq(ownerA, restaurantA))).body.data.pendingRequests, 0);
    const custom = await call(ownerController.createCategory, ownerReq(ownerA, restaurantA, { name: `Smoke Local ${Date.now()}` }));
    const localId = custom.body.data.id;
    const localApproved = await call(adminController.approveRequest('restaurant'), { user: admin, params: { requestId: localId }, body: {} });
    assert.equal(localApproved.body.data.category.scope, 'restaurant'); categoryIds.push(localApproved.body.data.category.id);
    const [listA, listB] = await Promise.all([call(ownerController.listCategories, ownerReq(ownerA, restaurantA)), call(ownerController.listCategories, ownerReq(ownerB, restaurantB))]);
    assert(listA.body.data.some((category) => category.id === localApproved.body.data.category.id)); assert(!listB.body.data.some((category) => category.id === localApproved.body.data.category.id));
    const rejection = await call(ownerController.createCategory, ownerReq(ownerA, restaurantA, { name: `Smoke Reject ${Date.now()}` }));
    await call(adminController.rejectRequest, { user: admin, params: { requestId: rejection.body.data.id }, body: { reason: 'Please use a clearer name.' } });
    assert.equal((await call(ownerController.summary, ownerReq(ownerA, restaurantA))).body.data.pendingRequests, 0);
    const rejected = await call(ownerController.listCategoryRequests, ownerReq(ownerA, restaurantA));
    assert.equal(rejected.body.data.find((request) => request.id === rejection.body.data.id).rejectionReason, 'Please use a clearer name.');
    const resubmitted = await call(ownerController.resubmitCategoryRequest, ownerReq(ownerA, restaurantA, { name: `Smoke Revised ${Date.now()}` }, { requestId: rejection.body.data.id }));
    assert.equal(resubmitted.body.data.status, 'pending');
    assert.equal((await call(ownerController.summary, ownerReq(ownerA, restaurantA))).body.data.pendingRequests, 1);
    const rejectedItem = await call(ownerController.createItem, ownerReq(ownerA, restaurantA, { name: 'Rejected category item', price: '10.00', categoryId: rejection.body.data.id })).catch((error) => error);
    assert.equal(rejectedItem.status, 400);
    const history = await FoodCategoryRequestHistory.findAll({ where: { requestId: rejection.body.data.id } });
    assert.deepEqual(history.map((entry) => entry.action).sort(), ['rejected', 'resubmitted', 'submitted']);
    const forbidden = await new Promise((resolve, reject) => requireSuperAdmin({ session: { userId: ownerA.id } }, { status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code, body }); } }, reject));
    assert.equal(forbidden.code, 403);
    const crossResubmit = await call(ownerController.resubmitCategoryRequest, ownerReq(ownerB, restaurantB, { name: 'Cross tenant' }, { requestId: rejection.body.data.id })).catch((error) => error);
    assert.equal(crossResubmit.status, 404);
    const duplicate = await call(adminController.createCategory, { user: admin, body: { name: globalCategory.name } });
    assert.equal(duplicate.code, 409);
    const item = await MenuItem.create({ restaurantId: restaurantA.id, categoryId: globalCategory.id, name: 'Smoke item', price: '9.00', foodType: 'veg' });
    const deactivate = await call(adminController.setCategoryStatus, { user: admin, params: { categoryId: globalCategory.id }, body: { isActive: false } });
    assert.equal(deactivate.body.data.isActive, false); assert.equal(await MenuItem.count({ where: { id: item.id } }), 1);
    const historyDetails = await call(adminController.requestDetails, { params: { requestId: rejection.body.data.id } });
    assert.equal(historyDetails.body.data.history.length, 3);
    assert.deepEqual(historyDetails.body.data.history.map((entry) => entry.action).sort(), ['rejected', 'resubmitted', 'submitted']);
    console.log('Food category workflow smoke checks passed.');
  } finally {
    await FoodCategoryRequest.destroy({ where: { restaurantId: restaurants.map((r) => r.id) } });
    await AuditLog.destroy({ where: { actorUserId: users.map((u) => u.id) } });
    await MenuItem.destroy({ where: { restaurantId: restaurants.map((r) => r.id) } });
    await MenuCategory.destroy({ where: { id: categoryIds } });
    await Restaurant.destroy({ where: { id: restaurants.map((r) => r.id) } });
    await User.destroy({ where: { id: users.map((u) => u.id) } });
    await require('../src/config/database').close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

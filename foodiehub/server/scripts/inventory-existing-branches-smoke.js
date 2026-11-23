'use strict';

// Exercises branch discovery and branch-specific inventory using an existing
// restaurant. Temporary user, supplier, item, movement and draft purchase data
// are removed in finally; this script never creates or changes a branch.
if (process.env.INVENTORY_EXISTING_BRANCHES_SMOKE !== 'yes') {
  throw new Error('Set INVENTORY_EXISTING_BRANCHES_SMOKE=yes to run this disposable API acceptance check.');
}

const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Branch, Restaurant, Role, User, RestaurantMember, InventoryItem,
  InventoryMovement, InventorySupplier, InventoryPurchaseOrder,
  InventoryPurchaseOrderItem,
} = require('../src/models');

const suffix = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
const password = `Inventory-existing-${crypto.randomBytes(10).toString('hex')}!`;
const created = { userId: null, memberId: null, itemIds: [], supplierId: null, orderIds: [] };
let server;
let cookie;
let baseUrl;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { status: response.status, data };
}

async function expect(label, result, status) {
  assert(result.status === status, `${label}: expected ${status}, got ${result.status}: ${JSON.stringify(result.data)}`);
}

async function cleanup() {
  if (cookie) await request('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
  if (created.orderIds.length) await InventoryPurchaseOrderItem.destroy({ where: { purchaseOrderId: created.orderIds } });
  if (created.orderIds.length) await InventoryPurchaseOrder.destroy({ where: { id: created.orderIds } });
  if (created.itemIds.length) await InventoryMovement.destroy({ where: { inventoryItemId: created.itemIds } });
  if (created.itemIds.length) await InventoryItem.destroy({ where: { id: created.itemIds } });
  if (created.supplierId) await InventorySupplier.destroy({ where: { id: created.supplierId } });
  if (created.memberId) await RestaurantMember.destroy({ where: { id: created.memberId } });
  if (created.userId) await User.destroy({ where: { id: created.userId } });
}

(async () => {
  try {
    await sequelize.authenticate();
    const [tenantRows] = await sequelize.query(
      'SELECT restaurant_id AS restaurantId, COUNT(*) AS branchCount FROM branches GROUP BY restaurant_id HAVING COUNT(*) >= 2 ORDER BY branchCount DESC LIMIT 1',
    );
    assert(tenantRows.length, 'The existing database has no restaurant with two or more branches.');
    const restaurantId = tenantRows[0].restaurantId;
    const branches = await Branch.findAll({ where: { restaurantId }, order: [['createdAt', 'ASC']], limit: 2 });
    assert(branches.length === 2, 'Could not load two existing branches from the selected restaurant.');
    const role = await Role.findOne({ where: { code: 'restaurant_owner', scope: 'restaurant' } });
    assert(role, 'The existing restaurant owner role is not seeded.');
    const user = await User.create({
      firstName: 'Temporary Inventory', lastName: 'Branch Check',
      email: `inventory-existing-${suffix}@example.invalid`,
      passwordHash: await bcrypt.hash(password, 10), status: 'active',
    });
    created.userId = user.id;
    const member = await RestaurantMember.create({ restaurantId, userId: user.id, roleId: role.id, status: 'active', joinedAt: new Date() });
    created.memberId = member.id;

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const login = await request('/api/v1/auth/login', { method: 'POST', body: { email: user.email, password, portal: 'restaurant' } });
    await expect('Temporary scoped owner login', login, 200);

    const branchResponse = await request('/api/v1/restaurant/branches?page=1&limit=100&status=all');
    await expect('Existing branch API list', branchResponse, 200);
    const listedBranches = branchResponse.data?.data?.branches;
    assert(Array.isArray(listedBranches), 'Branch API response does not expose data.branches.');
    assert(branches.every((branch) => listedBranches.some((row) => row.id === branch.id)), 'Authorized branch list omitted one of the existing branches.');

    const itemRows = [];
    for (const [index, branch] of branches.entries()) {
      const response = await request('/api/v1/restaurant/inventory/items', {
        method: 'POST',
        body: { branchId: branch.id, name: `Temporary branch stock ${index} ${suffix}`, sku: `TB-${suffix}-${index}`, unit: 'kg', openingQuantity: index ? 10 : 1, reorderLevel: 2, unitCost: 3 },
      });
      await expect(`Create disposable stock on existing branch ${index + 1}`, response, 201);
      created.itemIds.push(response.data.data.id);
      itemRows.push(response.data.data);
    }
    const supplier = await request('/api/v1/restaurant/inventory/suppliers', { method: 'POST', body: { name: `Temporary supplier ${suffix}` } });
    await expect('Create disposable restaurant supplier', supplier, 201);
    created.supplierId = supplier.data.data.id;

    const purchaseOrderIds = [];
    for (const [index, branch] of branches.entries()) {
      const purchase = await request('/api/v1/restaurant/inventory/purchase-orders', {
        method: 'POST',
        body: { branchId: branch.id, supplierId: created.supplierId, reference: `TMP-${suffix}-${index}`, items: [{ itemId: itemRows[index].id, quantity: 2, unitCost: 3 }] },
      });
      await expect(`Create branch ${index + 1} draft purchase order`, purchase, 201);
      created.orderIds.push(purchase.data.data.id);
      purchaseOrderIds.push(purchase.data.data.id);
    }
    const supplierList = await request('/api/v1/restaurant/inventory/suppliers');
    await expect('Read restaurant suppliers through existing inventory API', supplierList, 200);
    assert(supplierList.data.data.some((row) => row.id === created.supplierId), 'Restaurant supplier list omitted the saved supplier.');

    const branchResults = [];
    for (const [index, branch] of branches.entries()) {
      const params = `branchId=${branch.id}`;
      const [summary, items, movements, orders, lowStock] = await Promise.all([
        request(`/api/v1/restaurant/inventory/summary?${params}`),
        request(`/api/v1/restaurant/inventory/items?${params}&includeInactive=true`),
        request(`/api/v1/restaurant/inventory/movements?${params}`),
        request(`/api/v1/restaurant/inventory/purchase-orders?${params}`),
        request(`/api/v1/restaurant/inventory/items?${params}&lowStock=true`),
      ]);
      for (const [label, result] of [['summary', summary], ['items', items], ['movements', movements], ['purchase orders', orders], ['low stock', lowStock]]) await expect(`Branch ${index + 1} ${label} read`, result, 200);
      assert(items.data.data.length === 1 && items.data.data[0].id === itemRows[index].id, `Branch ${index + 1} item query returned another branch's stock.`);
      assert(movements.data.data.length === 1 && movements.data.data[0].inventoryItemId === itemRows[index].id, `Branch ${index + 1} movement query is not isolated.`);
      assert(orders.data.data.length === 1 && orders.data.data[0].id === purchaseOrderIds[index], `Branch ${index + 1} purchase order query returned another branch's orders.`);
      assert(Number(summary.data.data.itemCount) === 1, `Branch ${index + 1} summary count is not branch-specific.`);
      assert((lowStock.data.data.some((row) => row.id === itemRows[index].id)) === (index === 0), `Branch ${index + 1} low-stock result is incorrect.`);
      branchResults.push({ items: items.data.data.length, quantity: Number(items.data.data[0].quantityOnHand), movements: movements.data.data.length, lowStock: lowStock.data.data.length, purchaseOrders: orders.data.data.length });
    }
    assert(branchResults[0].quantity !== branchResults[1].quantity, 'Switching branch queries did not return independent stock quantities.');
    const foreignBranch = await Branch.findOne({ where: { restaurantId: { [require('sequelize').Op.ne]: restaurantId } } });
    if (foreignBranch) {
      const attack = await request('/api/v1/restaurant/inventory/items', { method: 'POST', body: { branchId: foreignBranch.id, name: `Cross tenant ${suffix}`, sku: `X-${suffix}`, unit: 'kg' } });
      await expect('Foreign restaurant branch cannot receive stock', attack, 404);
    }
    process.stdout.write(`${JSON.stringify({ result: 'PASS', existingBranchCount: Number(tenantRows[0].branchCount), branchesExposedByApi: listedBranches.length, independentBranchInventory: branchResults, foreignBranchWrite: foreignBranch ? '404' : 'not tested; only one tenant exists' }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ result: 'FAIL', message: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    try { await cleanup(); } catch (error) { process.stderr.write(`Temporary inventory cleanup failed: ${error.message}\n`); process.exitCode = 1; }
    if (server) await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
})();

'use strict';

// Opt-in API acceptance check for isolated disposable auth/onboarding fixtures.
// Run with PHASE1_ALLOW_DB_FIXTURES=yes node scripts/phase1-auth-onboarding-smoke.js
// It uses only random records created by this script and removes them in finally.
if (process.env.PHASE1_ALLOW_DB_FIXTURES !== 'yes') {
  throw new Error('Set PHASE1_ALLOW_DB_FIXTURES=yes to authorize disposable database fixtures.');
}

const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const Razorpay = require('razorpay');
const { Op } = require('sequelize');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const { createCustomerNotification } = require('../src/services/customer-notifications');
const {
  User, Role, UserRole, Permission, RolePermission, Restaurant, RestaurantMember,
  EmployeeBranchAssignment, Branch, MenuCategory, MenuItem, AuditLog, Reservation,
  Order, OrderItem, RestaurantTable, MenuItemOption, PosOrderRequest, PosTender,
  InventoryItem, InventoryMovement, InventorySupplier, InventoryPurchaseOrder,
  InventoryPurchaseOrderItem, InventoryRecipe, InventoryRecipeIngredient,
  SupportTicket, SupportMessage, SupportAttachment,
  CustomerNotification, CustomerNotificationPreference,
  CustomerReorderRequest, CustomerCart, CustomerCartItem,
  DeliveryAssignment, DeliveryStatusHistory, DeliveryLocation,
} = require('../src/models');

const password = 'Phase1-Smoke-2026!';
const suffix = `${Date.now()}-${require('node:crypto').randomBytes(4).toString('hex')}`;
const records = { users: [], restaurants: [], cookies: [], members: [], customRoles: [], branches: [], tables: [], menuItems: [], menuOptions: [], categories: [], orders: [], supportTickets: [] };
const results = [];
let server;
let baseUrl;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  const cookieHeader = response.headers.get('set-cookie');
  return {
    status: response.status,
    data,
    cookie: cookieHeader ? cookieHeader.split(';')[0] : cookie,
  };
}

async function expectStatus(label, result, expected) {
  results.push({ test: label, status: result.status, expected });
  assert(result.status === expected, `${label}: expected ${expected}, got ${result.status}; response=${JSON.stringify(result.data)}`);
}

async function login(email, portal) {
  const result = await request('/api/v1/auth/login', {
    method: 'POST', body: { email, password, ...(portal ? { portal } : {}) },
  });
  assert(result.status === 200, `Login failed (${result.status}).`);
  if (result.cookie) records.cookies.push(result.cookie);
  return result.cookie;
}

async function makePlatformUser(role, email) {
  const user = await User.create({
    firstName: 'Phase1', lastName: 'Acceptance', email,
    passwordHash: await bcrypt.hash(password, 10), status: 'active',
  });
  records.users.push(user.id);
  await UserRole.create({ userId: user.id, roleId: role.id });
  return user;
}

async function registerRestaurant(label) {
  const result = await request('/api/v1/auth/restaurant/register', {
    method: 'POST',
    body: {
      restaurantName: `Phase1 ${label} ${suffix}`,
      restaurantEmail: `restaurant-${label}-${suffix}@example.invalid`,
      restaurantPhone: `9${String(Date.now()).slice(-9)}`,
      description: 'Temporary acceptance fixture; delete after test.',
      ownerFirstName: 'Phase1', ownerLastName: label,
      ownerEmail: `owner-${label}-${suffix}@example.invalid`,
      ownerPhone: `8${String(Date.now() + (label === 'Reject' ? 1 : 2)).slice(-9)}`,
      password, confirmPassword: password,
    },
  });
  await expectStatus(`${label}: public restaurant registration`, result, 201);
  const restaurantId = result.data?.data?.restaurant?.id;
  assert(restaurantId, `${label}: registration did not return restaurant id.`);
  records.restaurants.push(restaurantId);
  return {
    restaurantId,
    ownerEmail: result.data.data.owner.email,
    ownerId: result.data.data.owner.id,
  };
}

async function cleanup() {
  for (const cookie of records.cookies) {
    await request('/api/v1/auth/logout', { method: 'POST', cookie }).catch(() => {});
  }
  if (records.members.length) await EmployeeBranchAssignment.destroy({ where: { restaurantMemberId: records.members } });
  if (records.users.length) {
    await CustomerNotification.destroy({ where: { customerId: records.users } });
    await CustomerNotificationPreference.destroy({ where: { customerId: records.users } });
    await CustomerReorderRequest.destroy({ where: { customerId: records.users } });
  }
  if (records.supportTickets.length) {
    await sequelize.query('DELETE FROM audit_logs WHERE entity_type = ? AND entity_id IN (?)', { replacements: ['support_ticket', records.supportTickets] });
    await SupportTicket.destroy({ where: { id: records.supportTickets } });
  }
  for (const restaurantId of records.restaurants) {
    // AuditLog is intentionally immutable through Sequelize hooks; target only
    // the unique disposable restaurant entity IDs created in this run.
    await sequelize.query(
      'DELETE FROM audit_logs WHERE entity_type = ? AND entity_id = ?',
      { replacements: ['restaurant', restaurantId] },
    );
    await InventoryRecipe.destroy({ where: { restaurantId } });
    await DeliveryLocation.destroy({ where: { restaurantId } });
    await DeliveryStatusHistory.destroy({ where: { restaurantId } });
    await DeliveryAssignment.destroy({ where: { restaurantId } });
    await InventoryPurchaseOrder.destroy({ where: { restaurantId } });
    await InventoryMovement.destroy({ where: { restaurantId } });
    await InventoryItem.destroy({ where: { restaurantId } });
    await InventorySupplier.destroy({ where: { restaurantId } });
    if (records.orders.length) {
      const posTenderIds = (await PosTender.findAll({ where: { orderId: records.orders }, attributes: ['id'] })).map((row) => row.id);
      const auditedIds = [...records.orders, ...posTenderIds];
      if (auditedIds.length) await sequelize.query('DELETE FROM audit_logs WHERE entity_type IN (?, ?, ?) AND entity_id IN (?)', { replacements: ['order', 'pos_order', 'pos_tender', auditedIds] });
      await PosTender.destroy({ where: { orderId: records.orders } });
      await PosOrderRequest.destroy({ where: { orderId: records.orders } });
    }
    await OrderItem.destroy({ where: { orderId: records.orders } });
    await Order.destroy({ where: { id: records.orders } });
    await Reservation.destroy({ where: { restaurantId } });
    await RestaurantTable.destroy({ where: { id: records.tables } });
    await MenuItemOption.destroy({ where: { id: records.menuOptions } });
    await MenuItem.destroy({ where: { id: records.menuItems } });
    await MenuCategory.destroy({ where: { id: records.categories } });
    await Branch.destroy({ where: { id: records.branches } });
  }
  if (records.restaurants.length) await RestaurantMember.destroy({ where: { restaurantId: records.restaurants } });
  if (records.customRoles.length) {
    await RolePermission.destroy({ where: { roleId: records.customRoles } });
    await Role.destroy({ where: { id: records.customRoles } });
  }
  if (records.restaurants.length) await Restaurant.destroy({ where: { id: records.restaurants } });
  if (records.users.length) {
    await UserRole.destroy({ where: { userId: records.users } });
    await User.destroy({ where: { id: records.users } });
  }
  // Owner accounts are created by the registration endpoint, not makePlatformUser.
  const ownerEmails = [`owner-Approve-${suffix}@example.invalid`, `owner-Reject-${suffix}@example.invalid`];
  await User.destroy({ where: { email: ownerEmails } });
  const remainingUsers = await User.count({ where: { email: { [Op.like]: `%${suffix}@example.invalid` } } });
  const remainingRestaurants = await Restaurant.count({ where: { slug: { [Op.like]: `%${suffix}%` } } });
  assert(remainingUsers === 0 && remainingRestaurants === 0, 'Disposable fixture cleanup left test records behind.');
  process.stdout.write('Disposable fixture cleanup: verified no matching users or restaurants remain.\n');
}

async function createBranch(restaurantId, labelText) {
  const branch = await Branch.create({
    restaurantId, name: `Phase1 ${labelText} ${suffix}`, branchCode: `SMOKE-${labelText}-${suffix.slice(-8)}`,
    phone: '9876543210', addressLine: '1 Test Road', city: 'Test City', state: 'Test State', postalCode: '000001', country: 'India',
    openingTime: '09:00:00', closingTime: '22:00:00', timeZone: 'Asia/Kolkata',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], closedDays: [], overnight: false,
    dineInEnabled: true, takeawayEnabled: true, deliveryEnabled: true, isPrimary: false, isActive: true,
    approvalStatus: 'approved', operationalStatus: 'open',
  });
  records.branches.push(branch.id);
  return branch;
}

async function createRestaurantEmployee({ restaurantId, branchId, role, email, ownerId }) {
  const user = await User.create({ firstName: 'Phase1', lastName: 'Staff', email, passwordHash: await bcrypt.hash(password, 10), status: 'active' });
  records.users.push(user.id);
  const member = await RestaurantMember.create({ restaurantId, userId: user.id, roleId: role.id, status: 'active', joinedAt: new Date() });
  records.members.push(member.id);
  await EmployeeBranchAssignment.create({ restaurantMemberId: member.id, branchId, assignedByUserId: ownerId, status: 'active' });
  return user;
}

async function inventoryWorkflow({ restaurantId, ownerId, ownerCookie, customerId, foreignRestaurantId }) {
  const branch = await createBranch(restaurantId, 'Inventory');
  const foreignBranch = await createBranch(foreignRestaurantId, 'Foreign');
  const category = await MenuCategory.create({ restaurantId, scope: 'restaurant', name: `Phase1 ${suffix}`, createdBy: ownerId, isActive: true });
  records.categories.push(category.id);
  const menuItem = await MenuItem.create({ restaurantId, categoryId: category.id, name: `Phase1 dish ${suffix}`, price: 100, foodType: 'veg', isAvailable: true, isActive: true, moderationStatus: 'clear' });
  records.menuItems.push(menuItem.id);

  const createItem = await request('/api/v1/restaurant/inventory/items', { method: 'POST', cookie: ownerCookie, body: { branchId: branch.id, name: `Phase1 flour ${suffix}`, sku: `F-${suffix}`, unit: 'kg', openingQuantity: 10, reorderLevel: 2, unitCost: 2.5 } });
  await expectStatus('Inventory ingredient creation with opening movement', createItem, 201);
  const inventoryItemId = createItem.data?.data?.id;
  assert(inventoryItemId, 'Inventory item was not returned.');
  const summary = await request(`/api/v1/restaurant/inventory/summary?branchId=${branch.id}`, { cookie: ownerCookie });
  await expectStatus('Branch inventory summary', summary, 200);
  assert(Number(summary.data?.data?.itemCount) === 1 && Number(summary.data?.data?.totalValue) === 25, 'Inventory summary does not match opening stock value.');
  await expectStatus('Prevent historical stock unit reinterpretation', await request(`/api/v1/restaurant/inventory/items/${inventoryItemId}`, { method: 'PUT', cookie: ownerCookie, body: { unit: 'g' } }), 409);
  await expectStatus('Ingredient metadata update', await request(`/api/v1/restaurant/inventory/items/${inventoryItemId}`, { method: 'PUT', cookie: ownerCookie, body: { name: `Updated flour ${suffix}`, sku: `UF-${suffix}`, reorderLevel: 2.5, unitCost: 2.75 } }), 200);
  const secondIngredient = await request('/api/v1/restaurant/inventory/items', { method: 'POST', cookie: ownerCookie, body: { branchId: branch.id, name: `Phase1 oil ${suffix}`, sku: `O-${suffix}`, unit: 'L', openingQuantity: 0, reorderLevel: 0, unitCost: 4 } });
  await expectStatus('Second ingredient for multi-line purchase order', secondIngredient, 201);
  const secondItemId = secondIngredient.data.data.id;

  const movementBody = { itemId: inventoryItemId, branchId: branch.id, movementType: 'adjustment_out', quantity: 2, idempotencyKey: `stock-adjust-${suffix}`, note: 'Acceptance test adjustment.' };
  await expectStatus('Stock adjustment', await request('/api/v1/restaurant/inventory/movements', { method: 'POST', cookie: ownerCookie, body: movementBody }), 201);
  await expectStatus('Duplicate stock adjustment idempotency', await request('/api/v1/restaurant/inventory/movements', { method: 'POST', cookie: ownerCookie, body: movementBody }), 200);
  await expectStatus('Wastage movement', await request('/api/v1/restaurant/inventory/movements', { method: 'POST', cookie: ownerCookie, body: { ...movementBody, movementType: 'wastage', quantity: 7, idempotencyKey: `stock-waste-${suffix}` } }), 201);
  const lowStock = await request(`/api/v1/restaurant/inventory/items?branchId=${branch.id}&lowStock=true`, { cookie: ownerCookie });
  await expectStatus('Low stock threshold alert', lowStock, 200);
  assert(lowStock.data.data.some((item) => item.id === inventoryItemId && Number(item.quantityOnHand) === 1) && lowStock.data.data.some((item) => item.id === secondItemId && Number(item.quantityOnHand) === 0), 'Wastage did not update quantity or low-stock alerts.');
  await expectStatus('Cross-restaurant item mutation denied', await request(`/api/v1/restaurant/inventory/items/${inventoryItemId}`, { method: 'PUT', cookie: (await login(`owner-Reject-${suffix}@example.invalid`, 'restaurant')), body: { reorderLevel: 8 } }), 404);

  const supplierResponse = await request('/api/v1/restaurant/inventory/suppliers', { method: 'POST', cookie: ownerCookie, body: { name: `Phase1 supplier ${suffix}`, phone: '9876543210' } });
  await expectStatus('Supplier creation', supplierResponse, 201);
  await expectStatus('Supplier contact update', await request(`/api/v1/restaurant/inventory/suppliers/${supplierResponse.data.data.id}`, { method: 'PUT', cookie: ownerCookie, body: { name: `Updated supplier ${suffix}`, email: `supplier-${suffix}@example.invalid` } }), 200);
  await expectStatus('Supplier deactivation and restoration', await request(`/api/v1/restaurant/inventory/suppliers/${supplierResponse.data.data.id}`, { method: 'PUT', cookie: ownerCookie, body: { isActive: false } }), 200);
  await expectStatus('Supplier reactivation', await request(`/api/v1/restaurant/inventory/suppliers/${supplierResponse.data.data.id}`, { method: 'PUT', cookie: ownerCookie, body: { isActive: true } }), 200);
  const poResponse = await request('/api/v1/restaurant/inventory/purchase-orders', { method: 'POST', cookie: ownerCookie, body: { branchId: branch.id, supplierId: supplierResponse.data.data.id, reference: `PO-${suffix}`, items: [{ itemId: inventoryItemId, quantity: 5, unitCost: 3 }, { itemId: secondItemId, quantity: 2, unitCost: 4.5 }] } });
  await expectStatus('Purchase order creation', poResponse, 201);
  const purchaseOrder = poResponse.data.data;
  await expectStatus('Purchase order placement', await request(`/api/v1/restaurant/inventory/purchase-orders/${purchaseOrder.id}`, { method: 'PATCH', cookie: ownerCookie, body: { status: 'ordered', branchId: branch.id } }), 200);
  await expectStatus('Purchase receipt updates stock', await request(`/api/v1/restaurant/inventory/purchase-orders/${purchaseOrder.id}/receive`, { method: 'POST', cookie: ownerCookie }), 200);
  await expectStatus('Duplicate purchase receipt is rejected', await request(`/api/v1/restaurant/inventory/purchase-orders/${purchaseOrder.id}/receive`, { method: 'POST', cookie: ownerCookie }), 409);
  await expectStatus('Inactive items remain available in history and can be reactivated', await request(`/api/v1/restaurant/inventory/items/${secondItemId}`, { method: 'PUT', cookie: ownerCookie, body: { isActive: false } }), 200);
  const archivedItems = await request(`/api/v1/restaurant/inventory/items?branchId=${branch.id}&includeInactive=true`, { cookie: ownerCookie });
  await expectStatus('Inventory history lists inactive items when requested', archivedItems, 200);
  assert(archivedItems.data.data.some((item) => item.id === secondItemId && !item.isActive), 'Inactive inventory item was not visible in history.');
  await expectStatus('Reactivate inactive inventory item', await request(`/api/v1/restaurant/inventory/items/${secondItemId}`, { method: 'PUT', cookie: ownerCookie, body: { isActive: true } }), 200);
  const rows = await request(`/api/v1/restaurant/inventory/items?branchId=${branch.id}&lowStock=true`, { cookie: ownerCookie });
  await expectStatus('Low stock query', rows, 200);
  const receivedStock = await request(`/api/v1/restaurant/inventory/items?branchId=${branch.id}`, { cookie: ownerCookie });
  const receivedFlour = receivedStock.data.data.find((item) => item.id === inventoryItemId);
  const receivedOil = receivedStock.data.data.find((item) => item.id === secondItemId);
  assert(rows.data.data.length === 0 && Number(receivedFlour?.quantityOnHand) === 6 && Number(receivedOil?.quantityOnHand) === 2, 'Received multi-line stock quantities are inconsistent.');

  await expectStatus('Recipe save', await request(`/api/v1/restaurant/inventory/recipes/${branch.id}/${menuItem.id}`, { method: 'PUT', cookie: ownerCookie, body: { yieldQuantity: 1, ingredients: [{ itemId: inventoryItemId, quantity: 0.25 }] } }), 200);
  const recipeRead = await request(`/api/v1/restaurant/inventory/recipes/${branch.id}/${menuItem.id}`, { cookie: ownerCookie });
  await expectStatus('Recipe read', recipeRead, 200);
  assert(Number(recipeRead.data.data.costEstimate.ingredientCostPerServing) === 0.75, 'Recipe food-cost estimate is incorrect.');
  await expectStatus('Ingredient used by an active recipe cannot be deactivated', await request(`/api/v1/restaurant/inventory/items/${inventoryItemId}`, { method: 'PUT', cookie: ownerCookie, body: { isActive: false } }), 409);
  await expectStatus('Recipe can be safely deactivated without deleting history', await request(`/api/v1/restaurant/inventory/recipes/${branch.id}/${menuItem.id}`, { method: 'DELETE', cookie: ownerCookie }), 200);
  await expectStatus('Deactivated recipe is absent from active recipe reads', await request(`/api/v1/restaurant/inventory/recipes/${branch.id}/${menuItem.id}`, { cookie: ownerCookie }), 200);
  assert(recipeRead.data.data.isActive && (await request(`/api/v1/restaurant/inventory/recipes/${branch.id}/${menuItem.id}`, { cookie: ownerCookie })).data.data === null, 'Recipe deactivation did not preserve historical response semantics.');
  await expectStatus('Recipe can be restored by saving its definition again', await request(`/api/v1/restaurant/inventory/recipes/${branch.id}/${menuItem.id}`, { method: 'PUT', cookie: ownerCookie, body: { yieldQuantity: 1, ingredients: [{ itemId: inventoryItemId, quantity: 0.25 }] } }), 200);

  async function createOrder(quantity) {
    const order = await Order.create({
      restaurantId, customerId, branchId: branch.id, orderType: 'takeaway', idempotencyKey: require('node:crypto').randomUUID(),
      orderNumber: `P1-${require('node:crypto').randomBytes(8).toString('hex')}`, status: quantity > 10 ? 'accepted' : 'pending',
      paymentStatus: 'pending', paymentMethod: 'cash_on_delivery', subtotal: 100, tax: 0, deliveryFee: 0, packagingFee: 0, discount: 0, total: 100,
      customerName: 'Phase1 Customer', customerPhone: null, customerEmail: null,
    });
    records.orders.push(order.id);
    await OrderItem.create({ orderId: order.id, menuItemId: menuItem.id, itemName: menuItem.name, quantity, unitPrice: 100, lineTotal: quantity * 100, addonsSnapshot: [] });
    return order;
  }
  const stockedOrder = await createOrder(2);
  await expectStatus('Pending order accepted while payment remains separate', await request(`/api/v1/restaurant/orders/${stockedOrder.id}/status`, { method: 'PATCH', cookie: ownerCookie, body: { status: 'accepted' } }), 200);
  const acceptedOrder = await Order.findByPk(stockedOrder.id);
  assert(acceptedOrder.status === 'accepted' && acceptedOrder.paymentStatus === 'pending', 'Order lifecycle incorrectly changed payment status.');
  await expectStatus('Preparing transition deducts recipe stock', await request(`/api/v1/restaurant/orders/${stockedOrder.id}/status`, { method: 'PATCH', cookie: ownerCookie, body: { status: 'preparing' } }), 200);
  await expectStatus('Repeated preparing transition cannot deduct twice', await request(`/api/v1/restaurant/orders/${stockedOrder.id}/status`, { method: 'PATCH', cookie: ownerCookie, body: { status: 'preparing' } }), 400);
  const afterOrder = await InventoryItem.findByPk(inventoryItemId);
  assert(Number(afterOrder.quantityOnHand) === 5.5 && acceptedOrder.paymentStatus === 'pending', 'Recipe stock deduction or payment/order status separation failed.');
  const shortOrder = await createOrder(100);
  await expectStatus('Insufficient stock blocks kitchen transition', await request(`/api/v1/restaurant/orders/${shortOrder.id}/status`, { method: 'PATCH', cookie: ownerCookie, body: { status: 'preparing' } }), 409);
  const rejectedStock = await InventoryItem.findByPk(inventoryItemId);
  const unchangedOrder = await Order.findByPk(shortOrder.id);
  assert(Number(rejectedStock.quantityOnHand) === 5.5 && unchangedOrder.status === 'accepted', 'Insufficient stock partially changed order or stock.');

  const customRole = await Role.create({ name: 'Inventory Read Acceptance', code: `smoke_inventory_${suffix}`, scope: 'restaurant', restaurantId, description: 'Disposable acceptance role', isSystem: false });
  records.customRoles.push(customRole.id);
  const viewPermission = await Permission.findOne({ where: { code: 'inventory.view' } });
  const managePermission = await Permission.findOne({ where: { code: 'inventory.manage' } });
  assert(viewPermission && managePermission, 'Inventory permissions are not seeded.');
  await RolePermission.create({ roleId: customRole.id, permissionId: viewPermission.id });
  const customUser = await createRestaurantEmployee({ restaurantId, branchId: branch.id, role: customRole, email: `staff-custom-${suffix}@example.invalid`, ownerId });
  const customCookie = await login(customUser.email, 'restaurant');
  await expectStatus('Custom role granted inventory read', await request(`/api/v1/restaurant/inventory/items?branchId=${branch.id}`, { cookie: customCookie }), 200);
  await expectStatus('Custom role denied inventory write', await request('/api/v1/restaurant/inventory/items', { method: 'POST', cookie: customCookie, body: { branchId: branch.id, name: 'Forbidden item', sku: `X-${suffix}`, unit: 'kg' } }), 403);
  const cashierRole = await Role.findOne({ where: { code: 'cashier', scope: 'restaurant' } });
  assert(cashierRole, 'Cashier role is not seeded.');
  const cashier = await createRestaurantEmployee({ restaurantId, branchId: branch.id, role: cashierRole, email: `staff-cashier-${suffix}@example.invalid`, ownerId });
  const cashierCookie = await login(cashier.email, 'restaurant');
  await expectStatus('Cashier denied inventory API', await request(`/api/v1/restaurant/inventory/items?branchId=${branch.id}`, { cookie: cashierCookie }), 403);
  await expectStatus('Assigned employee blocked from unassigned branch', await request(`/api/v1/restaurant/inventory/items?branchId=${foreignBranch.id}`, { cookie: cashierCookie }), 403);

  const variant = await MenuItemOption.create({ restaurantId, menuItemId: menuItem.id, type: 'variant', name: `POS large ${suffix}`, price: 10 });
  const addon = await MenuItemOption.create({ restaurantId, menuItemId: menuItem.id, type: 'addon', name: `POS extra ${suffix}`, price: 5 });
  const table = await RestaurantTable.create({ restaurantId, branchId: branch.id, tableNumber: `POS-${suffix.slice(-8)}`, seatingCapacity: 4, isActive: true, occupancyStatus: 'available' });
  records.menuOptions.push(variant.id, addon.id);
  records.tables.push(table.id);
  const posMenu = await request(`/api/v1/restaurant/pos/menu?branchId=${branch.id}`, { cookie: cashierCookie });
  await expectStatus('Cashier POS menu access', posMenu, 200);
  assert(posMenu.data.data.items.some((row) => row.id === menuItem.id && row.options.some((option) => option.id === variant.id) && row.options.some((option) => option.id === addon.id)), 'POS menu did not expose configured variant/add-on options.');
  await expectStatus('Cashier blocked from unassigned POS branch', await request(`/api/v1/restaurant/pos/menu?branchId=${foreignBranch.id}`, { cookie: cashierCookie }), 403);
  await expectStatus('Customer denied POS operations', await request('/api/v1/restaurant/pos/branches', { cookie: await login(`customer-${suffix}@example.invalid`) }), 403);
  const posRequestKey = require('node:crypto').randomUUID();
  const posBody = { branchId: branch.id, orderType: 'dine_in', tableId: table.id, customerName: 'POS Guest', customerPhone: '9876543210', items: [{ menuItemId: menuItem.id, variantOptionId: variant.id, addonOptionIds: [addon.id], quantity: 2 }], idempotencyKey: posRequestKey };
  const posCreate = await request('/api/v1/restaurant/pos/orders', { method: 'POST', cookie: cashierCookie, body: posBody });
  await expectStatus('Cashier creates dine-in POS order with menu options', posCreate, 201);
  const posOrderId = posCreate.data?.data?.id;
  if (posOrderId) records.orders.push(posOrderId);
  assert(posOrderId && Number(posCreate.data.data.total) === 30 && posCreate.data.data.customerName === 'POS Guest', `POS total or guest snapshot is incorrect: ${JSON.stringify(posCreate.data?.data)}.`);
  assert((await RestaurantTable.findByPk(table.id)).occupancyStatus === 'occupied', 'Dine-in POS order did not occupy its table.');
  const replay = await request('/api/v1/restaurant/pos/orders', { method: 'POST', cookie: cashierCookie, body: posBody });
  await expectStatus('Duplicate POS order request returns original order', replay, 201);
  assert(replay.data.data.id === posOrderId, 'POS order idempotency created a second order.');
  await expectStatus('POS idempotency key cannot be reused for different payload', await request('/api/v1/restaurant/pos/orders', { method: 'POST', cookie: cashierCookie, body: { ...posBody, customerName: 'Other guest' } }), 409);
  const firstTenderKey = require('node:crypto').randomUUID();
  const firstCash = { amount: 10, idempotencyKey: firstTenderKey };
  await expectStatus('POS split cash tender is recorded', await request(`/api/v1/restaurant/pos/orders/${posOrderId}/tenders/cash`, { method: 'POST', cookie: cashierCookie, body: firstCash }), 201);
  const cashReplay = await request(`/api/v1/restaurant/pos/orders/${posOrderId}/tenders/cash`, { method: 'POST', cookie: cashierCookie, body: firstCash });
  await expectStatus('POS cash tender retry is idempotent', cashReplay, 200);
  assert(cashReplay.data.data.paidAmount === 10 && cashReplay.data.data.balanceDue === 20 && cashReplay.data.data.paymentStatus === 'pending', 'Partial cash tender changed the balance or prematurely marked order paid.');
  await expectStatus('POS tender cannot exceed remaining balance', await request(`/api/v1/restaurant/pos/orders/${posOrderId}/tenders/cash`, { method: 'POST', cookie: cashierCookie, body: { amount: 21, idempotencyKey: require('node:crypto').randomUUID() } }), 409);
  const finalCash = await request(`/api/v1/restaurant/pos/orders/${posOrderId}/tenders/cash`, { method: 'POST', cookie: cashierCookie, body: { amount: 20, idempotencyKey: require('node:crypto').randomUUID() } });
  await expectStatus('Final POS split tender settles order', finalCash, 201);
  assert(finalCash.data.data.paymentStatus === 'paid' && finalCash.data.data.balanceDue === 0 && finalCash.data.data.tenders.length === 2, 'Split tenders did not settle the POS order exactly.');
  const posOrderAuditCount = await AuditLog.count({ where: { entityType: 'pos_order', entityId: posOrderId, action: 'pos.order.created' } });
  const posTenderAuditCount = await AuditLog.count({ where: { entityType: 'pos_tender', entityId: { [Op.in]: finalCash.data.data.tenders.map((row) => row.id) }, action: 'pos.tender.cash_recorded' } });
  assert(posOrderAuditCount === 1 && posTenderAuditCount === 2, 'POS order and cash tenders were not audited exactly once.');
  results.push({ test: 'POS order and split tender audit log entries', status: 200, expected: 200 });
  await expectStatus('Cashier can retrieve POS receipt details', await request(`/api/v1/restaurant/pos/orders/${posOrderId}`, { cookie: cashierCookie }), 200);
  const onlineBody = { ...posBody, orderType: 'takeaway', tableId: null, customerName: 'POS Online Guest', idempotencyKey: require('node:crypto').randomUUID() };
  const onlineOrder = await request('/api/v1/restaurant/pos/orders', { method: 'POST', cookie: cashierCookie, body: onlineBody });
  await expectStatus('Cashier creates separate online POS test order', onlineOrder, 201);
  records.orders.push(onlineOrder.data.data.id);
  const onlineIntent = await request(`/api/v1/restaurant/pos/orders/${onlineOrder.data.data.id}/tenders/razorpay/order`, { method: 'POST', cookie: cashierCookie, body: { amount: onlineOrder.data.data.balanceDue, idempotencyKey: require('node:crypto').randomUUID() } });
  results.push({ test: 'Razorpay POS test-mode order creation (no payment captured)', status: onlineIntent.status, expected: [201, 502, 503] });
  assert([201, 502, 503].includes(onlineIntent.status), `Unexpected Razorpay POS order-creation result: ${onlineIntent.status}.`);
  if (onlineIntent.status === 201) {
    assert(onlineIntent.data?.data?.razorpayOrderId && onlineIntent.data?.data?.tenderId, 'Razorpay POS intent response is incomplete.');
    const reconcile = await request(`/api/v1/restaurant/pos/tenders/${onlineIntent.data.data.tenderId}/razorpay/reconcile`, { method: 'POST', cookie: cashierCookie, body: { razorpayOrderId: onlineIntent.data.data.razorpayOrderId } });
    await expectStatus('Razorpay reports the uncaptured test tender as retryable', reconcile, 200);
    assert(reconcile.data.data.paymentStatus === 'pending' && reconcile.data.data.tenders[0]?.status === 'failed', 'Uncaptured Razorpay tender was not safely reconciled for retry.');
    const retryAsCash = await request(`/api/v1/restaurant/pos/orders/${onlineOrder.data.data.id}/tenders/cash`, { method: 'POST', cookie: cashierCookie, body: { amount: onlineOrder.data.data.balanceDue, idempotencyKey: require('node:crypto').randomUUID() } });
    await expectStatus('Reconciled uncaptured online order can be paid by cash', retryAsCash, 201);
    assert(retryAsCash.data.data.paymentStatus === 'paid', 'Retry cash tender did not settle the order.');
  }
}

async function reservationConcurrencyWorkflow({ restaurantId, ownerCookie, customerCookie, foreignRestaurantId }) {
  const branch = await createBranch(restaurantId, 'Reservation');
  const foreignBranch = await createBranch(foreignRestaurantId, 'ForeignReservation');
  const secondTable = await RestaurantTable.create({ restaurantId, branchId: branch.id, tableNumber: `RES-${suffix.slice(-8)}`, seatingCapacity: 4, isActive: true, occupancyStatus: 'available' });
  records.tables.push(secondTable.id);
  await Restaurant.update({ listingStatus: 'published', marketplaceEnabled: true }, { where: { id: restaurantId } });
  const secondCustomerEmail = `customer-two-${suffix}@example.invalid`;
  const secondCustomer = await request('/api/v1/auth/customer/register', { method: 'POST', body: { firstName: 'Phase1', lastName: 'GuestTwo', email: secondCustomerEmail, password, confirmPassword: password } });
  await expectStatus('Second reservation customer registration', secondCustomer, 201);
  records.users.push(secondCustomer.data.data.id);
  const secondCookie = await login(secondCustomerEmail);
  const date = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const reservationBody = { restaurantId, branchId: branch.id, guestName: 'Concurrent Guest', guestPhone: '9876543210', partySize: 2, startsAt: `${date}T19:00`, durationMinutes: 60 };
  const [first, second] = await Promise.all([
    request('/api/v1/customer/reservations', { method: 'POST', cookie: customerCookie, body: reservationBody }),
    request('/api/v1/customer/reservations', { method: 'POST', cookie: secondCookie, body: reservationBody }),
  ]);
  await expectStatus('First concurrent reservation request', first, 201);
  await expectStatus('Second overlapping request remains pending until restaurant confirms a table', second, 201);
  const firstId = first.data.data.id;
  const secondId = second.data.data.id;
  assert(first.data.data.tableId == null && second.data.data.tableId == null && first.data.data.status === 'pending' && second.data.data.status === 'pending', 'Online reservation requests should remain unassigned pending requests until staff confirmation.');
  const availableBefore = await request(`/api/v1/restaurant/floor/reservations/${firstId}/tables`, { cookie: ownerCookie });
  await expectStatus('Restaurant can see a candidate table before confirmation', availableBefore, 200);
  const candidateId = availableBefore.data.data.find((table) => table.id === secondTable.id)?.id;
  assert(candidateId, 'New table was not available for the reservation time.');
  await expectStatus('Customer cannot cancel another customer reservation', await request(`/api/v1/customer/reservations/${firstId}/cancel`, { method: 'PATCH', cookie: secondCookie }), 404);
  const confirmations = await Promise.all([
    request(`/api/v1/restaurant/floor/reservations/${firstId}/status`, { method: 'PATCH', cookie: ownerCookie, body: { status: 'confirmed', tableId: candidateId } }),
    request(`/api/v1/restaurant/floor/reservations/${secondId}/status`, { method: 'PATCH', cookie: ownerCookie, body: { status: 'confirmed', tableId: candidateId } }),
  ]);
  const confirmationStatuses = confirmations.map((result) => result.status).sort((a, b) => a - b);
  results.push({ test: 'Concurrent overlapping reservation confirmations serialize', statuses: confirmationStatuses, expected: [200, 409] });
  assert(confirmationStatuses[0] === 200 && confirmationStatuses[1] === 409, `Concurrent reservation confirmation statuses were ${confirmationStatuses.join(', ')}; expected one 200 and one 409.`);
  const winnerIndex = confirmations.findIndex((result) => result.status === 200);
  const winnerId = winnerIndex === 0 ? firstId : secondId;
  const loserId = winnerIndex === 0 ? secondId : firstId;
  const winnerCookie = winnerIndex === 0 ? customerCookie : secondCookie;
  assert((await RestaurantTable.findByPk(secondTable.id)).occupancyStatus === 'reserved', 'Confirmed future reservation did not set reserved table state.');
  await expectStatus('Customer cancellation restores the winning confirmation', await request(`/api/v1/customer/reservations/${winnerId}/cancel`, { method: 'PATCH', cookie: winnerCookie }), 200);
  assert((await RestaurantTable.findByPk(secondTable.id)).occupancyStatus === 'available', 'Cancellation did not restore table availability.');
  await expectStatus('Losing reservation can be confirmed after cancellation restores availability', await request(`/api/v1/restaurant/floor/reservations/${loserId}/status`, { method: 'PATCH', cookie: ownerCookie, body: { status: 'confirmed', tableId: candidateId } }), 200);
  assert((await RestaurantTable.findByPk(secondTable.id)).occupancyStatus === 'reserved', 'Reconfirmed reservation did not reserve table again.');
  await expectStatus('Reservation branch cannot be replaced with another restaurant branch', await request('/api/v1/customer/reservations', { method: 'POST', cookie: customerCookie, body: { ...reservationBody, restaurantId: restaurantId, branchId: foreignBranch.id } }), 404);
  results.push({ test: 'Reservation overlap confirmation serialization, cancellation restoration, ownership and tenant isolation', status: 200, expected: 200 });
}

async function qrWorkflow({ restaurantId, ownerCookie, customerCookie }) {
  const branch = await createBranch(restaurantId, 'QrAcceptance');
  await branch.update({ openingTime: '00:00:00', closingTime: '23:59:00', cashOnDeliveryEnabled: true });
  await Restaurant.update({ listingStatus: 'published', marketplaceEnabled: true, acceptingOrders: true }, { where: { id: restaurantId } });
  const table = await RestaurantTable.create({ restaurantId, branchId: branch.id, tableNumber: `QR-${suffix.slice(-8)}`, seatingCapacity: 4, isActive: true, occupancyStatus: 'available' });
  records.tables.push(table.id);
  const slug = (await Restaurant.findByPk(restaurantId)).slug;
  const restaurantQr = await request(`/api/v1/public/restaurants/${encodeURIComponent(slug)}/qr`);
  await expectStatus('Restaurant menu QR generated', restaurantQr, 200);
  assert(restaurantQr.data?.data?.imageDataUrl?.startsWith('data:image/png;base64,') && restaurantQr.data.data.qrUrl.endsWith(`/restaurants/${encodeURIComponent(slug)}`), 'Restaurant QR did not encode the restaurant menu URL.');
  const branchQr = await request(`/api/v1/public/restaurants/${encodeURIComponent(slug)}/branches/${branch.id}/qr`);
  await expectStatus('Branch menu QR generated', branchQr, 200);
  const branchUrl = new URL(branchQr.data.data.qrUrl);
  assert(branchUrl.pathname.endsWith(`/restaurants/${encodeURIComponent(slug)}`) && branchUrl.searchParams.get('branchId') === branch.id, 'Branch QR did not identify its restaurant and branch.');
  const generated = await request(`/api/v1/restaurant/tables/${table.id}/qr`, { method: 'POST', cookie: ownerCookie, body: {} });
  await expectStatus('Individual table QR generated', generated, 200);
  const tablePayload = generated.data.data;
  assert(tablePayload.qrUrl && tablePayload.imageDataUrl?.startsWith('data:image/png;base64,'), 'Table QR response is incomplete.');
  const tableToken = (await RestaurantTable.findByPk(table.id)).qrToken;
  assert(tableToken && tablePayload.qrUrl.endsWith(`/qr/${tableToken}`), 'Generated table URL does not contain its active token.');
  const resolved = await request(`/api/v1/public/qr/${tableToken}`);
  await expectStatus('Generated table QR target resolves to its restaurant, branch and table', resolved, 200);
  assert(resolved.data.data.branch.name === branch.name && resolved.data.data.table.number === table.tableNumber, 'Table QR resolved to the wrong branch or table.');
  assert((await RestaurantTable.findByPk(table.id)).occupancyStatus === 'available', 'Resolving a QR unexpectedly occupied the table.');
  const menuItem = await MenuItem.findOne({ where: { restaurantId, isActive: true, isAvailable: true } });
  assert(menuItem, 'QR dine-in acceptance needs an available menu item.');
  await expectStatus('Reject unsupported dietary metadata', await request(`/api/v1/restaurant/menu/items/${menuItem.id}`, { method: 'PUT', cookie: ownerCookie, body: { name: menuItem.name, categoryId: menuItem.categoryId, price: Number(menuItem.price), foodType: menuItem.foodType, dietaryTags: ['paleo_unknown'], allergenTags: [] } }), 400);
  await expectStatus('Restaurant saves dietary and allergen labels', await request(`/api/v1/restaurant/menu/items/${menuItem.id}`, { method: 'PUT', cookie: ownerCookie, body: { name: menuItem.name, categoryId: menuItem.categoryId, price: Number(menuItem.price), foodType: menuItem.foodType, dietaryTags: ['vegan'], allergenTags: ['sesame'] } }), 200);
  const taggedMenu = await request(`/api/v1/public/restaurants/${encodeURIComponent(slug)}/menu?branchId=${branch.id}`);
  await expectStatus('Customer menu exposes dietary and allergen labels', taggedMenu, 200);
  const taggedItem = taggedMenu.data.data.flatMap((category) => category.items).find((item) => item.id === menuItem.id);
  assert(taggedItem?.dietaryTags?.includes('vegan') && taggedItem?.allergenTags?.includes('sesame'), 'Customer menu did not expose saved dietary/allergen labels.');
  const variant = await MenuItemOption.findOne({ where: { menuItemId: menuItem.id, restaurantId, type: 'variant' } });
  const waitingCustomerEmail = `customer-occupied-table-${suffix}@example.invalid`;
  const waitingCustomer = await request('/api/v1/auth/customer/register', { method: 'POST', body: { firstName: 'Waiting', lastName: 'Guest', email: waitingCustomerEmail, password, confirmPassword: password } });
  await expectStatus('Register second customer for occupied-table checkout race', waitingCustomer, 201);
  records.users.push(waitingCustomer.data.data.id);
  const waitingCustomerCookie = await login(waitingCustomerEmail);
  await expectStatus('Second customer builds a QR cart while table is available', await request('/api/v1/customer/cart/items', { method: 'POST', cookie: waitingCustomerCookie, body: { menuItemId: menuItem.id, ...(variant ? { variantOptionId: variant.id } : {}), quantity: 1, tableQrToken: tableToken } }), 201);
  const qrCart = await request('/api/v1/customer/cart/items', { method: 'POST', cookie: customerCookie, body: { menuItemId: menuItem.id, ...(variant ? { variantOptionId: variant.id } : {}), quantity: 1, tableQrToken: tableToken } });
  await expectStatus('Customer adds menu item through table QR to dine-in cart', qrCart, 201);
  assert(qrCart.data.data.restaurant.id === restaurantId && qrCart.data.data.branch.id === branch.id && qrCart.data.data.orderType === 'dine_in' && qrCart.data.data.table.number === table.tableNumber, 'QR ordering cart did not bind to the token restaurant, branch and table.');
  assert((await RestaurantTable.findByPk(table.id)).occupancyStatus === 'available', 'Adding a QR cart item unexpectedly occupied the table.');
  const checkoutKey = require('node:crypto').randomUUID();
  const orderBody = { idempotencyKey: checkoutKey, paymentMethod: 'cash_on_delivery', orderType: 'dine_in' };
  const order = await request('/api/v1/customer/orders', { method: 'POST', cookie: customerCookie, body: orderBody });
  await expectStatus('QR dine-in cart submits a real pending-payment order', order, 201);
  const qrOrderId = order.data.data.order.id;
  records.orders.push(qrOrderId);
  assert(order.data.data.order.orderType === 'dine_in' && order.data.data.order.tableId === table.id && order.data.data.order.paymentStatus === 'pending', 'QR checkout did not preserve table linkage or separate order/payment states.');
  await expectStatus('QR order submission retry returns the same order', await request('/api/v1/customer/orders', { method: 'POST', cookie: customerCookie, body: orderBody }), 200);
  assert((await RestaurantTable.findByPk(table.id)).occupancyStatus === 'occupied', 'Placed dine-in order did not mark its table occupied.');
  results.push({ test: 'QR dine-in order and payment status separation', orderStatus: order.data.data.order.status, paymentStatus: order.data.data.order.paymentStatus, expected: ['pending', 'pending'] });
  await expectStatus('Occupied table QR resolver rejects a new scan', await request(`/api/v1/public/qr/${tableToken}`), 404);
  await expectStatus('Occupied table rejects adding another QR cart item', await request('/api/v1/customer/cart/items', { method: 'POST', cookie: waitingCustomerCookie, body: { menuItemId: menuItem.id, ...(variant ? { variantOptionId: variant.id } : {}), quantity: 1, tableQrToken: tableToken } }), 404);
  const waitingCheckoutKey = require('node:crypto').randomUUID();
  const blockedOccupiedCheckout = await request('/api/v1/customer/orders', { method: 'POST', cookie: waitingCustomerCookie, body: { idempotencyKey: waitingCheckoutKey, paymentMethod: 'cash_on_delivery', orderType: 'dine_in' } });
  await expectStatus('Concurrent QR checkout cannot place a second order while table is occupied', blockedOccupiedCheckout, 409);
  const cancellation = await request(`/api/v1/customer/orders/${qrOrderId}/cancel`, { method: 'PATCH', cookie: customerCookie });
  await expectStatus('Customer cancels own pending QR order', cancellation, 200);
  assert(cancellation.data.data.status === 'cancelled' && cancellation.data.data.paymentStatus === 'pending', 'Customer cancellation changed payment state or did not cancel the pending order.');
  assert((await RestaurantTable.findByPk(table.id)).occupancyStatus === 'available', 'Order cancellation did not restore table availability.');
  const repeatedCancellation = await request(`/api/v1/customer/orders/${qrOrderId}/cancel`, { method: 'PATCH', cookie: customerCookie });
  await expectStatus('Customer cancellation retry is idempotent', repeatedCancellation, 200);
  assert(repeatedCancellation.data.data.repeated === true, 'Repeated customer cancellation was not identified as a replay.');
  assert((await RestaurantTable.findByPk(table.id)).occupancyStatus === 'available', 'Cancelling the first order did not free the table for the waiting cart.');
  const reorderKey = require('node:crypto').randomUUID();
  await expectStatus('Customer reorders own prior order', await request(`/api/v1/customer/orders/${qrOrderId}/reorder`, { method: 'POST', cookie: customerCookie, body: { idempotencyKey: reorderKey } }), 201);
  const reorderedCart = await CustomerCart.findOne({ where: { customerId: order.data.data.order.customerId }, include: [{ model: CustomerCartItem, as: 'items' }] });
  assert(reorderedCart && !reorderedCart.tableId && reorderedCart.items.length === 1 && reorderedCart.items[0].quantity === 1, 'Reorder did not create the expected non-table cart contents.');
  await expectStatus('Customer reorder retry is idempotent', await request(`/api/v1/customer/orders/${qrOrderId}/reorder`, { method: 'POST', cookie: customerCookie, body: { idempotencyKey: reorderKey } }), 200);
  const replayCart = await CustomerCart.findOne({ where: { customerId: order.data.data.order.customerId }, include: [{ model: CustomerCartItem, as: 'items' }] });
  assert(replayCart.items[0].quantity === 1, 'Replaying a reorder duplicated cart quantity.');
  await expectStatus('Another customer cannot reorder this order', await request(`/api/v1/customer/orders/${qrOrderId}/reorder`, { method: 'POST', cookie: waitingCustomerCookie, body: { idempotencyKey: require('node:crypto').randomUUID() } }), 404);
  await expectStatus('Customer clears reorder cart', await request('/api/v1/customer/cart', { method: 'DELETE', cookie: customerCookie }), 200);
  results.push({ test: 'One-tap reorder ownership, current menu validation path, and retry idempotency', status: 200, expected: 200 });
  const afterAvailability = await request('/api/v1/customer/orders', { method: 'POST', cookie: waitingCustomerCookie, body: { idempotencyKey: waitingCheckoutKey, paymentMethod: 'cash_on_delivery', orderType: 'dine_in' } });
  await expectStatus('Waiting QR cart can check out after table availability is restored', afterAvailability, 201);
  const waitingOrderId = afterAvailability.data.data.order.id;
  records.orders.push(waitingOrderId);
  await expectStatus('Second customer cancels its order after table becomes available', await request(`/api/v1/customer/orders/${waitingOrderId}/cancel`, { method: 'PATCH', cookie: waitingCustomerCookie }), 200);
  assert((await RestaurantTable.findByPk(table.id)).occupancyStatus === 'available', 'Cancelling the retried QR order did not restore table availability.');
  const paidOrder = await Order.create({ restaurantId, customerId: order.data.data.order.customerId, branchId: branch.id, orderType: 'takeaway', orderNumber: `PAID-CANCEL-${suffix}`, status: 'pending', paymentStatus: 'paid', paymentMethod: 'razorpay', razorpayPaymentId: `pay_fixture_${suffix}`, subtotal: 100, tax: 0, deliveryFee: 0, packagingFee: 0, discount: 0, total: 100, customerName: 'Paid Cancellation Fixture' });
  records.orders.push(paidOrder.id);
  const paidCancellation = await request(`/api/v1/customer/orders/${paidOrder.id}/cancel`, { method: 'PATCH', cookie: customerCookie });
  await expectStatus('Customer cancellation preserves an already-paid payment state', paidCancellation, 200);
  assert(paidCancellation.data.data.status === 'cancelled' && paidCancellation.data.data.paymentStatus === 'paid', 'Cancelling a paid order incorrectly changed its payment state.');

  const gatewayOrderId = `order_fixture_${suffix}`;
  const paymentId = `pay_callback_fixture_${suffix}`;
  const callbackOrder = await Order.create({ restaurantId, customerId: order.data.data.order.customerId, branchId: branch.id, tableId: table.id, orderType: 'dine_in', orderNumber: `CAPTURE-RACE-${suffix}`, status: 'cancelled', cancelledAt: new Date(), paymentStatus: 'pending', paymentMethod: 'razorpay', razorpayOrderId: gatewayOrderId, subtotal: 100, tax: 0, deliveryFee: 0, packagingFee: 0, discount: 0, total: 100, customerName: 'Capture Race Fixture' });
  records.orders.push(callbackOrder.id);
  const originalAddResources = Razorpay.prototype.addResources;
  const oldKeyId = process.env.RAZORPAY_KEY_ID;
  const oldKeySecret = process.env.RAZORPAY_KEY_SECRET;
  const stubSecret = `fixture-secret-${suffix}`;
  let fakePaymentFetches = 0;
  try {
    process.env.RAZORPAY_KEY_ID = 'key_fixture_id';
    process.env.RAZORPAY_KEY_SECRET = stubSecret;
    Razorpay.prototype.addResources = function addStubResources() {
      originalAddResources.call(this);
      this.payments.fetch = async (requestedPaymentId) => { fakePaymentFetches += 1; return { id: requestedPaymentId, order_id: gatewayOrderId, amount: 10000, currency: 'INR', status: 'captured' }; };
    };
    const signature = crypto.createHmac('sha256', stubSecret).update(`${gatewayOrderId}|${paymentId}`).digest('hex');
    const verified = await request(`/api/v1/customer/orders/${callbackOrder.id}/payments/razorpay/verify`, { method: 'POST', cookie: customerCookie, body: { razorpay_payment_id: paymentId, razorpay_order_id: gatewayOrderId, razorpay_signature: signature } });
    await expectStatus('Captured Razorpay callback after cancellation reconciles through a local SDK stub', verified, 200);
    const reconciled = await Order.findByPk(callbackOrder.id);
    assert(verified.data.data.refundMayBeRequired && verified.data.data.orderStatus === 'cancelled' && reconciled.status === 'cancelled' && reconciled.paymentStatus === 'paid', 'Late captured callback did not preserve the cancelled order and persist paid payment status.');
    assert((await RestaurantTable.findByPk(table.id)).occupancyStatus === 'available', 'Late payment capture occupied a table for a cancelled order.');
    const duplicateCallback = await request(`/api/v1/customer/orders/${callbackOrder.id}/payments/razorpay/verify`, { method: 'POST', cookie: customerCookie, body: { razorpay_payment_id: paymentId, razorpay_order_id: gatewayOrderId, razorpay_signature: signature } });
    await expectStatus('Duplicate captured callback is idempotent', duplicateCallback, 200);
    assert(fakePaymentFetches === 1 && await CustomerNotification.count({ where: { customerId: order.data.data.order.customerId, category: 'payments', entityId: callbackOrder.id } }) === 1, 'Duplicate callback fetched or notified a second time.');
    results.push({ test: 'Captured-after-cancellation and duplicate callback with local Razorpay SDK stub', orderStatus: reconciled.status, paymentStatus: reconciled.paymentStatus, providerNetworkCalls: 0, providerFetches: fakePaymentFetches });
  } finally {
    Razorpay.prototype.addResources = originalAddResources;
    if (oldKeyId == null) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = oldKeyId;
    if (oldKeySecret == null) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = oldKeySecret;
  }
  await expectStatus('Customer can clear QR ordering cart', await request('/api/v1/customer/cart', { method: 'DELETE', cookie: customerCookie }), 200);
  await expectStatus('Malformed table QR rejected', await request('/api/v1/public/qr/not-a-token'), 404);
  await RestaurantTable.update({ isActive: false, occupancyStatus: 'inactive', qrToken: null }, { where: { id: table.id } });
  await expectStatus('Inactive table QR issuance denied', await request(`/api/v1/restaurant/tables/${table.id}/qr`, { method: 'POST', cookie: ownerCookie, body: {} }), 409);
  await expectStatus('Customer QR order blocked after table deactivation', await request('/api/v1/customer/cart/items', { method: 'POST', cookie: customerCookie, body: { menuItemId: menuItem.id, ...(variant ? { variantOptionId: variant.id } : {}), quantity: 1, tableQrToken: tableToken } }), 404);
  await expectStatus('Revoked table QR token rejected', await request(`/api/v1/public/qr/${tableToken}`), 404);
  results.push({ test: 'Restaurant, branch and table QR generation/resolution; malformed and revoked token rejection; scan-side effect', status: 200, expected: 200, scannedImage: false });
  return qrOrderId;
}

async function customerSupportWorkflow({ customerId, customerCookie, adminCookie }) {
  const alternateEmail = `customer-support-other-${suffix}@example.invalid`;
  const alternate = await request('/api/v1/auth/customer/register', { method: 'POST', body: { firstName: 'Other', lastName: 'Customer', email: alternateEmail, password, confirmPassword: password } });
  await expectStatus('Second customer for support ownership boundary', alternate, 201);
  records.users.push(alternate.data.data.id);
  const otherCookie = await login(alternateEmail);
  const badOrderId = require('node:crypto').randomUUID();
  await expectStatus('Customer cannot associate another or nonexistent order with a ticket', await request('/api/v1/customer/support/tickets', { method: 'POST', cookie: customerCookie, body: { subject: 'Order assistance', category: 'Orders', description: 'Please investigate this order issue.', relatedOrderId: badOrderId } }), 400);
  const created = await request('/api/v1/customer/support/tickets', { method: 'POST', cookie: customerCookie, body: { subject: `Customer help ${suffix}`, category: 'Account & Login', description: 'Please help with a customer account issue.', attachments: [{ fileName: 'customer-note.txt', dataUrl: `data:text/plain;base64,${Buffer.from('Customer support fixture').toString('base64')}` }] } });
  await expectStatus('Customer creates support request', created, 201);
  const ticketId = created.data.ticket.id;
  records.supportTickets.push(ticketId);
  const list = await request('/api/v1/customer/support/tickets', { cookie: customerCookie });
  await expectStatus('Customer lists own support tickets', list, 200);
  assert(list.data.tickets.some((ticket) => ticket.id === ticketId), 'Created customer support ticket is absent from the customer list.');
  await expectStatus('Other customer cannot read support ticket', await request(`/api/v1/customer/support/tickets/${ticketId}`, { cookie: otherCookie }), 404);
  await expectStatus('Other customer cannot reply to support ticket', await request(`/api/v1/customer/support/tickets/${ticketId}/replies`, { method: 'POST', cookie: otherCookie, body: { body: 'Unauthorized reply.' } }), 404);
  const detail = await request(`/api/v1/customer/support/tickets/${ticketId}`, { cookie: customerCookie });
  await expectStatus('Customer opens own support ticket', detail, 200);
  const attachmentId = detail.data.ticket.attachments[0].id;
  const ownAttachment = await request(`/api/v1/customer/support/attachments/${attachmentId}`, { cookie: customerCookie });
  await expectStatus('Customer downloads own support attachment', ownAttachment, 200);
  await expectStatus('Other customer cannot download attachment', await request(`/api/v1/customer/support/attachments/${attachmentId}`, { cookie: otherCookie }), 404);
  const adminList = await request('/api/v1/admin/support/tickets', { cookie: adminCookie });
  await expectStatus('Super Admin support inbox includes customer ticket', adminList, 200);
  assert(adminList.data.tickets.some((ticket) => ticket.id === ticketId && !ticket.restaurantId && ticket.creator?.id === customerId), 'Super Admin inbox did not identify the customer support request.');
  await expectStatus('Super Admin replies to customer support ticket', await request(`/api/v1/admin/support/tickets/${ticketId}/replies`, { method: 'POST', cookie: adminCookie, body: { body: 'We are reviewing your request.' } }), 201);
  const replied = await request(`/api/v1/customer/support/tickets/${ticketId}`, { cookie: customerCookie });
  await expectStatus('Customer sees Super Admin reply', replied, 200);
  assert(replied.data.ticket.messages.some((message) => message.authorType === 'admin' && message.body === 'We are reviewing your request.'), 'Customer reply thread is missing the Admin response.');
  const supportNotifications = await request('/api/v1/customer/notifications', { cookie: customerCookie });
  assert(supportNotifications.data.data.notifications.some((notification) => notification.category === 'support' && notification.entityId === ticketId), 'Admin reply/status changes did not create durable customer support notifications.');
  await expectStatus('Super Admin resolves customer ticket', await request(`/api/v1/admin/support/tickets/${ticketId}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'resolved' } }), 200);
  await expectStatus('Customer reply reopens resolved ticket', await request(`/api/v1/customer/support/tickets/${ticketId}/replies`, { method: 'POST', cookie: customerCookie, body: { body: 'I have one more detail to add.' } }), 201);
  const reopened = await request(`/api/v1/customer/support/tickets/${ticketId}`, { cookie: customerCookie });
  assert(reopened.data.ticket.status === 'in_progress', 'Customer reply did not reopen the resolved ticket.');
  await expectStatus('Customer cannot access admin support API', await request('/api/v1/admin/support/tickets', { cookie: customerCookie }), 403);
  results.push({ test: 'Customer support ownership, attachment privacy, admin reply and resolution/reopen workflow', status: 200, expected: 200 });
}

async function customerNotificationWorkflow({ customerId, customerCookie, orderId, adminCookie }) {
  await expectStatus('Customer notifications reject unauthenticated access', await request('/api/v1/customer/notifications'), 401);
  const initial = await request('/api/v1/customer/notification-preferences', { cookie: customerCookie });
  await expectStatus('Customer notification preferences load', initial, 200);
  assert(initial.data.data.orderUpdates && initial.data.data.paymentUpdates && initial.data.data.reservationUpdates && initial.data.data.deliveryUpdates && initial.data.data.supportUpdates && initial.data.data.marketingUpdates === false, 'Notification defaults do not enable operational updates and disable marketing.');
  await expectStatus('Reject unknown notification preference', await request('/api/v1/customer/notification-preferences', { method: 'PATCH', cookie: customerCookie, body: { adminUpdates: true } }), 400);
  await expectStatus('Reject non-boolean notification preference', await request('/api/v1/customer/notification-preferences', { method: 'PATCH', cookie: customerCookie, body: { orderUpdates: 'false' } }), 400);
  await expectStatus('Customer updates marketing preference', await request('/api/v1/customer/notification-preferences', { method: 'PATCH', cookie: customerCookie, body: { marketingUpdates: true } }), 200);
  await expectStatus('Customer turns marketing preference back off', await request('/api/v1/customer/notification-preferences', { method: 'PATCH', cookie: customerCookie, body: { marketingUpdates: false } }), 200);
  const dedupeKey = `notification-idempotency:${suffix}`;
  const first = await createCustomerNotification({ app, customerId, category: 'orders', title: 'Test idempotency', message: 'One event only.', dedupeKey });
  const repeated = await createCustomerNotification({ app, customerId, category: 'orders', title: 'Test idempotency', message: 'One event only.', dedupeKey });
  assert(first.id === repeated.id && await CustomerNotification.count({ where: { customerId, dedupeKey } }) === 1, 'Repeated notification event created duplicate rows.');
  await CustomerNotificationPreference.update({ deliveryUpdates: false }, { where: { customerId } });
  const suppressed = await createCustomerNotification({ app, customerId, category: 'delivery', title: 'Suppressed delivery', message: 'Preference disabled.', dedupeKey: `${dedupeKey}:delivery` });
  assert(suppressed === null, 'Disabled delivery notifications were persisted.');
  await CustomerNotificationPreference.update({ deliveryUpdates: true }, { where: { customerId } });

  const list = await request('/api/v1/customer/notifications', { cookie: customerCookie });
  await expectStatus('Customer notification center lists owned records', list, 200);
  const placed = list.data.data.notifications.find((notification) => notification.entityId === orderId && notification.category === 'orders' && notification.title === 'Order placed');
  assert(placed && placed.href === `/customer/orders/${orderId}` && list.data.data.unreadCount >= 1, 'Actual checkout did not create an unread, navigable order notification.');
  await expectStatus('Customer marks own notification read', await request(`/api/v1/customer/notifications/${placed.id}/read`, { method: 'PATCH', cookie: customerCookie }), 200);

  const otherEmail = `customer-notification-other-${suffix}@example.invalid`;
  const other = await request('/api/v1/auth/customer/register', { method: 'POST', body: { firstName: 'Other', lastName: 'Customer', email: otherEmail, password, confirmPassword: password } });
  await expectStatus('Register another customer for notification ownership boundary', other, 201);
  records.users.push(other.data.data.id);
  const otherCookie = await login(otherEmail);
  await expectStatus('Other customer cannot mark notification read', await request(`/api/v1/customer/notifications/${placed.id}/read`, { method: 'PATCH', cookie: otherCookie }), 404);
  await expectStatus('Other customer cannot cancel this order', await request(`/api/v1/customer/orders/${orderId}/cancel`, { method: 'PATCH', cookie: otherCookie }), 404);
  await expectStatus('Customer marks all remaining notifications read', await request('/api/v1/customer/notifications/read-all', { method: 'POST', cookie: customerCookie }), 200);
  const afterRead = await request('/api/v1/customer/notifications?limit=1', { cookie: customerCookie });
  assert(afterRead.data.data.unreadCount === 0, 'Mark-all-read left unread notifications behind.');
  await expectStatus('Customer denied Admin support operations', await request('/api/v1/admin/support/tickets', { cookie: customerCookie }), 403);
  await expectStatus('Super Admin denied customer notification API', await request('/api/v1/customer/notifications', { cookie: adminCookie }), 403);
  results.push({ test: 'Persistent customer notifications, preferences, read state and ownership', status: 200, expected: 200 });
}

async function staffRoleWorkflow({ restaurantId, ownerId, ownerCookie, customerId, customerCookie, adminCookie }) {
  const branch = await createBranch(restaurantId, 'RoleMatrix');
  const unassignedBranch = await createBranch(restaurantId, 'RoleUnassigned');
  const waiterRole = await Role.findOne({ where: { code: 'waiter', scope: 'restaurant' } });
  const kitchenRole = await Role.findOne({ where: { code: 'kitchen_staff', scope: 'restaurant' } });
  const managerRole = await Role.findOne({ where: { code: 'manager', scope: 'restaurant' } });
  const deliveryRole = await Role.findOne({ where: { code: 'delivery_associate', scope: 'restaurant' } });
  assert(waiterRole && kitchenRole && managerRole && deliveryRole, 'A default restaurant staff role is not seeded.');
  const manager = await createRestaurantEmployee({ restaurantId, branchId: branch.id, role: managerRole, email: `staff-manager-${suffix}@example.invalid`, ownerId });
  const waiter = await createRestaurantEmployee({ restaurantId, branchId: branch.id, role: waiterRole, email: `staff-waiter-${suffix}@example.invalid`, ownerId });
  const kitchen = await createRestaurantEmployee({ restaurantId, branchId: branch.id, role: kitchenRole, email: `staff-kitchen-${suffix}@example.invalid`, ownerId });
  const delivery = await createRestaurantEmployee({ restaurantId, branchId: branch.id, role: deliveryRole, email: `staff-delivery-${suffix}@example.invalid`, ownerId });
  const deliveryBackup = await createRestaurantEmployee({ restaurantId, branchId: branch.id, role: deliveryRole, email: `staff-delivery-backup-${suffix}@example.invalid`, ownerId });
  const deliveryOtherBranch = await createRestaurantEmployee({ restaurantId, branchId: unassignedBranch.id, role: deliveryRole, email: `staff-delivery-other-branch-${suffix}@example.invalid`, ownerId });
  const deliveryInactive = await createRestaurantEmployee({ restaurantId, branchId: branch.id, role: deliveryRole, email: `staff-delivery-inactive-${suffix}@example.invalid`, ownerId });
  const deliveryOtherBranchMember = await RestaurantMember.findOne({ where: { restaurantId, userId: deliveryOtherBranch.id } });
  const deliveryInactiveMember = await RestaurantMember.findOne({ where: { restaurantId, userId: deliveryInactive.id } });
  await deliveryInactiveMember.update({ status: 'inactive' });
  const waiterMember = await RestaurantMember.findOne({ where: { restaurantId, userId: waiter.id } });
  const table = await RestaurantTable.create({ restaurantId, branchId: branch.id, tableNumber: `STAFF-${suffix.slice(-8)}`, seatingCapacity: 4, isActive: true, occupancyStatus: 'available', assignedWaiterMemberId: waiterMember.id });
  records.tables.push(table.id);
  const menuItem = await MenuItem.findOne({ where: { restaurantId, isActive: true, isAvailable: true } });
  assert(menuItem, 'The staff role workflow needs an available menu item.');
  const order = await Order.create({ restaurantId, customerId, branchId: branch.id, tableId: table.id, orderType: 'dine_in', orderNumber: `ROLE-${require('node:crypto').randomBytes(8).toString('hex')}`, status: 'accepted', paymentStatus: 'pending', paymentMethod: 'cash_on_delivery', subtotal: 100, tax: 0, deliveryFee: 0, packagingFee: 0, discount: 0, total: 100, customerName: 'Role Matrix Guest' });
  records.orders.push(order.id);
  await OrderItem.create({ orderId: order.id, menuItemId: menuItem.id, itemName: menuItem.name, quantity: 1, unitPrice: 100, lineTotal: 100, addonsSnapshot: [] });
  const ownerRefundAttempt = await request(`/api/v1/restaurant/orders/${order.id}/refund`, { method: 'POST', cookie: ownerCookie, body: { reason: 'Permission boundary acceptance check' } });
  await expectStatus('Owner refund permission reaches captured-payment eligibility validation', ownerRefundAttempt, 409);
  assert(ownerRefundAttempt.data?.message?.includes('Only captured Razorpay orders'), 'Owner refund request did not reach refund eligibility validation.');
  await expectStatus('Customer cannot cancel after restaurant acceptance', await request(`/api/v1/customer/orders/${order.id}/cancel`, { method: 'PATCH', cookie: customerCookie }), 409);

  const managerCookie = await login(manager.email, 'restaurant');
  await expectStatus('Manager can view assigned branch inventory', await request(`/api/v1/restaurant/inventory/summary?branchId=${branch.id}`, { cookie: managerCookie }), 200);
  await expectStatus('Manager denied cashier POS without POS permission', await request('/api/v1/restaurant/pos/branches', { cookie: managerCookie }), 403);

  const waiterCookie = await login(waiter.email, 'restaurant');
  const waiterOrders = await request(`/api/v1/restaurant/orders?branchId=${branch.id}`, { cookie: waiterCookie });
  await expectStatus('Waiter can read assigned-table orders', waiterOrders, 200);
  assert(waiterOrders.data.data.orders.some((row) => row.id === order.id), 'Waiter could not see their assigned table order.');
  await expectStatus('Waiter denied unassigned branch order access', await request(`/api/v1/restaurant/orders?branchId=${unassignedBranch.id}`, { cookie: waiterCookie }), 403);
  await expectStatus('Waiter cannot advance kitchen status', await request(`/api/v1/restaurant/orders/${order.id}/status`, { method: 'PATCH', cookie: waiterCookie, body: { status: 'preparing' } }), 403);
  await expectStatus('Waiter denied inventory access', await request(`/api/v1/restaurant/inventory/items?branchId=${branch.id}`, { cookie: waiterCookie }), 403);
  await expectStatus('Waiter denied refund permission', await request(`/api/v1/restaurant/orders/${order.id}/refund`, { method: 'POST', cookie: waiterCookie, body: { reason: 'Not authorized' } }), 403);

  const kitchenCookie = await login(kitchen.email, 'restaurant');
  await expectStatus('Kitchen Staff can read kitchen orders', await request(`/api/v1/restaurant/orders?branchId=${branch.id}`, { cookie: kitchenCookie }), 200);
  await expectStatus('Kitchen Staff can start preparation', await request(`/api/v1/restaurant/orders/${order.id}/status`, { method: 'PATCH', cookie: kitchenCookie, body: { status: 'preparing' } }), 200);
  await expectStatus('Kitchen Staff denied inventory write surface', await request(`/api/v1/restaurant/inventory/items?branchId=${branch.id}`, { cookie: kitchenCookie }), 403);

  const deliveryCookie = await login(delivery.email, 'restaurant');
  await expectStatus('Delivery Staff own dashboard', await request('/api/v1/restaurant/delivery/dashboard', { cookie: deliveryCookie }), 200);
  await expectStatus('Delivery Staff updates own availability', await request('/api/v1/restaurant/delivery/me/availability', { method: 'PATCH', cookie: deliveryCookie, body: { availabilityStatus: 'available' } }), 200);
  await expectStatus('Delivery Staff denied POS access', await request('/api/v1/restaurant/pos/branches', { cookie: deliveryCookie }), 403);

  const deliveryOrder = await Order.create({
    restaurantId, customerId, branchId: branch.id, orderType: 'delivery',
    orderNumber: `DELIVERY-${require('node:crypto').randomBytes(8).toString('hex')}`,
    deliveryAddress: JSON.stringify({ street: '1 Test Road', city: 'Test City', state: 'Test State', postalCode: '000001', country: 'India', latitude: 12.9716, longitude: 77.5946 }),
    status: 'pending', paymentStatus: 'pending', paymentMethod: 'cash_on_delivery', subtotal: 100, tax: 0, deliveryFee: 0, packagingFee: 0, discount: 0, total: 100, customerName: 'Delivery Workflow Guest', customerPhone: '9876543210',
  });
  const deliveryMember = await RestaurantMember.findOne({ where: { restaurantId, userId: delivery.id } });
  records.orders.push(deliveryOrder.id);
  await OrderItem.create({ orderId: deliveryOrder.id, menuItemId: menuItem.id, itemName: menuItem.name, quantity: 1, unitPrice: 100, lineTotal: 100, addonsSnapshot: [] });
  await expectStatus('Delivery assignment is rejected before kitchen readiness', await request(`/api/v1/restaurant/delivery/orders/${deliveryOrder.id}/assignments`, { method: 'POST', cookie: ownerCookie, body: { restaurantMemberId: deliveryMember.id } }), 409);
  const earlyQueue = await request('/api/v1/restaurant/delivery/orders?status=pending_assignment', { cookie: ownerCookie });
  await expectStatus('Pending delivery order is excluded from ready assignment queue', earlyQueue, 200);
  assert(!earlyQueue.data.orders.some((row) => row.id === deliveryOrder.id), 'A not-ready delivery order appeared in assignment queue.');
  for (const status of ['accepted', 'preparing', 'ready']) {
    await expectStatus(`Restaurant delivery order transition to ${status}`, await request(`/api/v1/restaurant/orders/${deliveryOrder.id}/status`, { method: 'PATCH', cookie: ownerCookie, body: { status } }), 200);
  }
  const eligible = await request(`/api/v1/restaurant/delivery/orders/${deliveryOrder.id}/eligible-staff`, { cookie: ownerCookie });
  await expectStatus('Ready delivery order returns eligible branch staff', eligible, 200);
  assert(eligible.data.staff.some((row) => row.id === deliveryMember.id), 'Assigned delivery employee was missing from the eligible list.');
  assert(!eligible.data.staff.some((row) => row.id === deliveryOtherBranchMember.id || row.id === deliveryInactiveMember.id), 'Ineligible branch or inactive delivery staff appeared in the candidate list.');
  await expectStatus('Employee assigned to another branch cannot receive delivery', await request(`/api/v1/restaurant/delivery/orders/${deliveryOrder.id}/assignments`, { method: 'POST', cookie: ownerCookie, body: { restaurantMemberId: deliveryOtherBranchMember.id } }), 400);
  await expectStatus('Inactive employee cannot receive delivery', await request(`/api/v1/restaurant/delivery/orders/${deliveryOrder.id}/assignments`, { method: 'POST', cookie: ownerCookie, body: { restaurantMemberId: deliveryInactiveMember.id } }), 400);
  const assigned = await request(`/api/v1/restaurant/delivery/orders/${deliveryOrder.id}/assignments`, { method: 'POST', cookie: ownerCookie, body: { restaurantMemberId: deliveryMember.id } });
  await expectStatus('Ready order assigned to its branch delivery employee', assigned, 201);
  const assignmentId = assigned.data?.assignment?.id;
  assert(assignmentId, `Assignment API did not return its identifier: ${JSON.stringify(assigned.data)}`);

  const orderListAfterAssignment = await request(`/api/v1/restaurant/orders?branchId=${branch.id}`, { cookie: ownerCookie });
  await expectStatus('Orders API exposes its current delivery assignment', orderListAfterAssignment, 200);
  const listedDeliveryOrder = orderListAfterAssignment.data.data.orders.find((row) => row.id === deliveryOrder.id);
  assert(listedDeliveryOrder?.deliveryAssignment?.id === assignmentId && listedDeliveryOrder.deliveryAssignment.employee.fullName && listedDeliveryOrder.deliveryAssignment.employee.phone !== undefined, `Orders API did not return the current associate contact fields: ${JSON.stringify(listedDeliveryOrder?.deliveryAssignment)}.`);
  const firstAssignmentHistory = await request(`/api/v1/restaurant/delivery/assignments?branchId=${branch.id}`, { cookie: ownerCookie });
  await expectStatus('Delivery Management history includes Orders-created assignment', firstAssignmentHistory, 200);
  assert(firstAssignmentHistory.data.assignments.some((row) => row.id === assignmentId), 'New assignment did not immediately appear in delivery history.');
  const filteredHistory = await request(`/api/v1/restaurant/delivery/assignments?branchId=${branch.id}&status=pending_acceptance&search=${deliveryOrder.orderNumber}`, { cookie: ownerCookie });
  await expectStatus('Delivery history branch/status/order search filters', filteredHistory, 200);
  assert(filteredHistory.data.assignments.some((row) => row.id === assignmentId), 'Delivery assignment filters omitted the matching order.');
  const adminAssignments = await request(`/api/v1/admin/delivery/assignments?branchId=${branch.id}&search=${deliveryOrder.orderNumber}`, { cookie: adminCookie });
  await expectStatus('Super Admin sees assignments across restaurant branches', adminAssignments, 200);
  assert(adminAssignments.data.assignments.some((row) => row.id === assignmentId && row.restaurantId === restaurantId), 'Platform assignment list omitted the restaurant delivery record.');
  const backupMember = await RestaurantMember.findOne({ where: { restaurantId, userId: deliveryBackup.id } });
  const backupCookie = await login(deliveryBackup.email, 'restaurant');
  await expectStatus('Backup delivery associate sets availability', await request('/api/v1/restaurant/delivery/me/availability', { method: 'PATCH', cookie: backupCookie, body: { availabilityStatus: 'available' } }), 200);
  const reassigned = await request(`/api/v1/restaurant/delivery/orders/${deliveryOrder.id}/assignments`, { method: 'POST', cookie: ownerCookie, body: { restaurantMemberId: backupMember.id, reason: 'Acceptance test reassignment.' } });
  await expectStatus('Owner reassigns delivery while preserving old record', reassigned, 200);
  const replacementAssignmentId = reassigned.data?.assignment?.id;
  assert(replacementAssignmentId && replacementAssignmentId !== assignmentId, 'Reassignment did not create a new historical assignment.');
  await expectStatus('Delivery associate rejects with a required reason', await request(`/api/v1/restaurant/delivery/assignments/${replacementAssignmentId}/action`, { method: 'POST', cookie: backupCookie, body: { action: 'reject', reason: 'Unable to take this delivery.' } }), 200);
  const retryAssignment = await request(`/api/v1/restaurant/delivery/orders/${deliveryOrder.id}/assignments`, { method: 'POST', cookie: ownerCookie, body: { restaurantMemberId: deliveryMember.id } });
  await expectStatus('Rejected delivery can be assigned again', retryAssignment, 201);
  const finalAssignmentId = retryAssignment.data?.assignment?.id;
  const afterReassignmentHistory = await request(`/api/v1/restaurant/delivery/assignments?branchId=${branch.id}`, { cookie: ownerCookie });
  const deliveryHistory = afterReassignmentHistory.data.assignments.filter((row) => row.orderId === deliveryOrder.id);
  assert(deliveryHistory.length === 3 && deliveryHistory.some((row) => row.id === assignmentId && row.status === 'reassigned') && deliveryHistory.some((row) => row.id === replacementAssignmentId && row.status === 'rejected' && row.notes === 'Unable to take this delivery.') && deliveryHistory.some((row) => row.id === finalAssignmentId && row.status === 'pending_acceptance'), 'Reassignment/rejection did not preserve all previous assignment records.');
  await expectStatus('Delivery employee cannot act on another employee assignment', await request(`/api/v1/restaurant/delivery/assignments/${finalAssignmentId}/action`, { method: 'POST', cookie: backupCookie, body: { action: 'accept' } }), 403);
  for (const action of ['accept', 'arriving_at_restaurant', 'picked_up', 'on_the_way', 'delivered']) {
    const actionResult = await request(`/api/v1/restaurant/delivery/assignments/${finalAssignmentId}/action`, { method: 'POST', cookie: deliveryCookie, body: { action, ...(action === 'delivered' ? { confirmation: true } : {}) } });
    await expectStatus(`Delivery employee lifecycle action ${action}`, actionResult, 200);
  }
  const completedDeliveryOrder = await Order.findByPk(deliveryOrder.id);
  assert(completedDeliveryOrder.status === 'completed' && completedDeliveryOrder.paymentStatus === 'pending', 'Delivery completion changed payment state or failed to complete the order.');
  const trackedOrder = await request(`/api/v1/customer/orders/${deliveryOrder.id}`, { cookie: customerCookie });
  await expectStatus('Customer can track owned delivery order after completion', trackedOrder, 200);
  assert(trackedOrder.data.data.deliveryTracking?.status === 'delivered', 'Customer tracking did not report delivered state.');
  const finalHistory = await request(`/api/v1/restaurant/delivery/assignments?branchId=${branch.id}`, { cookie: ownerCookie });
  const deliveredRecord = finalHistory.data.assignments.find((row) => row.id === finalAssignmentId);
  assert(deliveredRecord?.pickedUpAt && deliveredRecord?.deliveredAt && deliveredRecord?.completedAt, 'Assignment history omitted pickup/delivery completion timestamps.');
  const otherCustomer = await makePlatformUser(await Role.findOne({ where: { code: 'customer', scope: 'platform' } }), `other-customer-${suffix}@example.invalid`);
  await expectStatus('Another customer cannot view delivery tracking', await request(`/api/v1/customer/orders/${deliveryOrder.id}`, { cookie: await login(otherCustomer.email) }), 404);
  assert((await Order.findByPk(order.id)).status === 'preparing', 'Kitchen status update did not persist.');
  results.push({ test: 'Manager, Waiter, Kitchen Staff, and Delivery Staff authenticated authorization', status: 200, expected: 200 });
}

async function run() {
  await sequelize.authenticate();
  const adminRole = await Role.findOne({ where: { code: 'super_admin', scope: 'platform' } });
  const customerRole = await Role.findOne({ where: { code: 'customer', scope: 'platform' } });
  assert(adminRole && customerRole, 'Required seeded platform roles are missing.');

  const adminEmail = `admin-${suffix}@example.invalid`;
  const admin = await makePlatformUser(adminRole, adminEmail);
  const customerEmail = `customer-${suffix}@example.invalid`;
  const customerResult = await request('/api/v1/auth/customer/register', {
    method: 'POST',
    body: { firstName: 'Phase1', lastName: 'Customer', email: customerEmail, password, confirmPassword: password },
  });
  await expectStatus('Customer registration', customerResult, 201);
  records.users.push(customerResult.data.data.id);

  const adminCookie = await login(adminEmail);
  const adminDashboard = await request('/api/v1/admin/dashboard', { cookie: adminCookie });
  await expectStatus('Super Admin dashboard authorization', adminDashboard, 200);
  const customerCookie = await login(customerEmail);
  await expectStatus('Customer session restoration', await request('/api/v1/auth/me', { cookie: customerCookie }), 200);
  await expectStatus('Customer denied admin operations', await request('/api/v1/admin/dashboard', { cookie: customerCookie }), 403);
  await expectStatus('Customer denied restaurant operations', await request('/api/v1/restaurant/branches', { cookie: customerCookie }), 403);

  const approved = await registerRestaurant('Approve');
  const pendingOwnerCookie = await login(approved.ownerEmail, 'restaurant');
  const pendingMe = await request('/api/v1/auth/me', { cookie: pendingOwnerCookie });
  await expectStatus('Pending owner session restoration', pendingMe, 200);
  assert(pendingMe.data?.user?.restaurantMemberships?.some((membership) => membership.restaurant?.approvalStatus === 'pending'), 'Owner session did not expose its pending restaurant application.');
  await expectStatus('Owner denied admin operations', await request('/api/v1/admin/dashboard', { cookie: pendingOwnerCookie }), 403);
  const approval = await request(`/api/v1/admin/restaurants/${approved.restaurantId}/approve`, { method: 'PATCH', cookie: adminCookie, body: {} });
  await expectStatus('Super Admin approves registration', approval, 200);
  assert(approval.data?.data?.approvalStatus === 'approved', 'Approval response did not mark the restaurant approved.');
  await expectStatus('Approved owner restaurant API access', await request('/api/v1/restaurant/branches', { cookie: pendingOwnerCookie }), 200);

  const rejected = await registerRestaurant('Reject');
  const rejection = await request(`/api/v1/admin/restaurants/${rejected.restaurantId}/reject`, {
    method: 'PATCH', cookie: adminCookie, body: { reason: 'Temporary acceptance rejection test.' },
  });
  await expectStatus('Super Admin rejects registration', rejection, 200);
  assert(rejection.data?.data?.approvalStatus === 'rejected', 'Rejection response did not mark the restaurant rejected.');

  await inventoryWorkflow({ restaurantId: approved.restaurantId, ownerId: approved.ownerId, ownerCookie: pendingOwnerCookie, customerId: customerResult.data.data.id, foreignRestaurantId: rejected.restaurantId });
  await staffRoleWorkflow({ restaurantId: approved.restaurantId, ownerId: approved.ownerId, ownerCookie: pendingOwnerCookie, customerId: customerResult.data.data.id, customerCookie, adminCookie });
  await reservationConcurrencyWorkflow({ restaurantId: approved.restaurantId, ownerCookie: pendingOwnerCookie, customerCookie, foreignRestaurantId: rejected.restaurantId });
  const qrOrderId = await qrWorkflow({ restaurantId: approved.restaurantId, ownerCookie: pendingOwnerCookie, customerCookie });
  await customerNotificationWorkflow({ customerId: customerResult.data.data.id, customerCookie, orderId: qrOrderId, adminCookie });
  await customerSupportWorkflow({ customerId: customerResult.data.data.id, customerCookie, adminCookie });

  const logout = await request('/api/v1/auth/logout', { method: 'POST', cookie: customerCookie });
  await expectStatus('Customer logout', logout, 200);
  await expectStatus('Logged-out customer session invalidated', await request('/api/v1/auth/me', { cookie: logout.cookie }), 401);
}

(async () => {
  try {
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    await run();
    process.stdout.write(`${JSON.stringify({ result: 'PASS', checks: results }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ result: 'FAIL', message: error.message, checks: results }, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    try { await cleanup(); } catch (error) {
      process.stderr.write(`Fixture cleanup failed: ${error.message}\n`);
      process.exitCode = 1;
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
})();

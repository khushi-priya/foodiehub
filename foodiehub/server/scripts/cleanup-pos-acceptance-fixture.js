'use strict';

// Removes only one explicitly named disposable suffix from the opt-in acceptance runner.
// Usage: PHASE1_CLEANUP_SUFFIX=<printed timestamp-hex suffix> node scripts/cleanup-pos-acceptance-fixture.js
const { Op } = require('sequelize');
const sequelize = require('../src/config/database');
const { User, UserRole, RolePermission, Role, Restaurant, RestaurantMember, EmployeeBranchAssignment, Branch, RestaurantTable, MenuCategory, MenuItem, MenuItemOption, Order, OrderItem, PosOrderRequest, PosTender, InventoryRecipe, InventoryPurchaseOrder, InventoryMovement, InventoryItem, InventorySupplier, InventoryPurchaseOrderItem, InventoryRecipeIngredient } = require('../src/models');

(async () => {
  const suffix = process.env.PHASE1_CLEANUP_SUFFIX;
  if (!/^\d{10,}-[0-9a-f]{8}$/i.test(suffix || '')) throw new Error('Provide the exact timestamp-hex acceptance suffix printed by the runner.');
  await sequelize.authenticate();
  const restaurants = await Restaurant.findAll({ where: { name: { [Op.like]: `%${suffix}%` } }, attributes: ['id'] });
  const restaurantIds = restaurants.map((row) => row.id);
  if (!restaurantIds.length) { process.stdout.write('No matching acceptance restaurants found.\n'); return; }
  const members = await RestaurantMember.findAll({ where: { restaurantId: restaurantIds }, attributes: ['id'] });
  const memberIds = members.map((row) => row.id);
  await EmployeeBranchAssignment.destroy({ where: { restaurantMemberId: memberIds } });
  const orders = await Order.findAll({ where: { restaurantId: restaurantIds }, attributes: ['id'] });
  const orderIds = orders.map((row) => row.id);
  const tenderIds = (await PosTender.findAll({ where: { orderId: orderIds }, attributes: ['id'] })).map((row) => row.id);
  const auditedIds = [...orderIds, ...tenderIds];
  if (auditedIds.length) await sequelize.query('DELETE FROM audit_logs WHERE entity_type IN (?, ?) AND entity_id IN (?)', { replacements: ['pos_order', 'pos_tender', auditedIds] });
  await PosTender.destroy({ where: { orderId: orderIds } });
  await PosOrderRequest.destroy({ where: { orderId: orderIds } });
  await InventoryRecipeIngredient.destroy({ where: { recipeId: { [Op.in]: (await InventoryRecipe.findAll({ where: { restaurantId: restaurantIds }, attributes: ['id'] })).map((row) => row.id) } } });
  await InventoryRecipe.destroy({ where: { restaurantId: restaurantIds } });
  const purchases = await InventoryPurchaseOrder.findAll({ where: { restaurantId: restaurantIds }, attributes: ['id'] });
  await InventoryPurchaseOrderItem.destroy({ where: { purchaseOrderId: purchases.map((row) => row.id) } });
  await InventoryPurchaseOrder.destroy({ where: { restaurantId: restaurantIds } });
  await InventoryMovement.destroy({ where: { restaurantId: restaurantIds } });
  await InventoryItem.destroy({ where: { restaurantId: restaurantIds } });
  await InventorySupplier.destroy({ where: { restaurantId: restaurantIds } });
  await OrderItem.destroy({ where: { orderId: orderIds } });
  await Order.destroy({ where: { id: orderIds } });
  await RestaurantTable.destroy({ where: { restaurantId: restaurantIds } });
  const menuItems = await MenuItem.findAll({ where: { restaurantId: restaurantIds }, attributes: ['id'] });
  await MenuItemOption.destroy({ where: { menuItemId: menuItems.map((row) => row.id) } });
  await MenuItem.destroy({ where: { restaurantId: restaurantIds } });
  await MenuCategory.destroy({ where: { restaurantId: restaurantIds } });
  const branchRows = await Branch.findAll({ where: { restaurantId: restaurantIds }, attributes: ['id'] });
  await Branch.destroy({ where: { id: branchRows.map((row) => row.id) } });
  await RestaurantMember.destroy({ where: { restaurantId: restaurantIds } });
  for (const restaurantId of restaurantIds) await sequelize.query('DELETE FROM audit_logs WHERE entity_type = ? AND entity_id = ?', { replacements: ['restaurant', restaurantId] });
  await Restaurant.destroy({ where: { id: restaurantIds } });
  const users = await User.findAll({ where: { email: { [Op.like]: `%${suffix}@example.invalid` } }, attributes: ['id'] });
  const userIds = users.map((row) => row.id);
  const customRoles = await Role.findAll({ where: { code: `smoke_inventory_${suffix}` }, attributes: ['id'] });
  const roleIds = customRoles.map((row) => row.id);
  await RolePermission.destroy({ where: { roleId: roleIds } });
  await Role.destroy({ where: { id: roleIds } });
  await UserRole.destroy({ where: { userId: userIds } });
  await User.destroy({ where: { id: userIds } });
  process.stdout.write(`Removed disposable acceptance fixtures for suffix ${suffix}; restaurants=${restaurantIds.length}, orders=${orderIds.length}, users=${userIds.length}.\n`);
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }).finally(() => sequelize.close());

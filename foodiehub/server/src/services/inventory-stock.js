'use strict';

const { Op } = require('sequelize');
const { OrderItem, InventoryRecipe, InventoryRecipeIngredient, InventoryItem, InventoryMovement } = require('../models');

const conflict = (message) => Object.assign(new Error(message), { status: 409 });

// Called inside the existing order status transaction when an accepted order
// enters preparation. Only configured recipes consume stock; the order row lock
// and unique movement keys prevent concurrent/retried duplicate deductions.
async function deductRecipeStockForOrder(order, transaction, actorUserId) {
  const orderItems = await OrderItem.findAll({
    where: { orderId: order.id },
    attributes: ['id', 'menuItemId', 'quantity'],
    transaction,
  });
  if (!orderItems.length) return [];

  const recipes = await InventoryRecipe.findAll({
    where: { restaurantId: order.restaurantId, branchId: order.branchId, menuItemId: { [Op.in]: orderItems.map((item) => item.menuItemId) }, isActive: true },
    include: [{ model: InventoryRecipeIngredient, as: 'ingredients', attributes: ['id', 'inventoryItemId', 'quantity'] }],
    transaction,
  });
  const recipeByMenuItem = new Map(recipes.map((recipe) => [recipe.menuItemId, recipe]));
  const requirements = new Map();
  for (const orderItem of orderItems) {
    const recipe = recipeByMenuItem.get(orderItem.menuItemId);
    if (!recipe) continue;
    const portions = Number(orderItem.quantity) / Number(recipe.yieldQuantity);
    if (!Number.isFinite(portions) || portions <= 0) throw conflict('An order line has an invalid recipe quantity.');
    for (const ingredient of recipe.ingredients || []) {
      const quantity = Number(ingredient.quantity) * portions;
      const key = `${orderItem.id}:${ingredient.id}`;
      const existing = requirements.get(ingredient.inventoryItemId) || { quantity: 0, keys: [] };
      existing.quantity += quantity;
      existing.keys.push({ key, orderItemId: orderItem.id, quantity });
      requirements.set(ingredient.inventoryItemId, existing);
    }
  }
  if (!requirements.size) return [];

  const itemIds = [...requirements.keys()].sort();
  const expectedKeys = itemIds.flatMap((id) => requirements.get(id).keys.map((line) => `order:${order.id}:${line.key}`));
  const existingMovements = await InventoryMovement.findAll({
    where: { inventoryItemId: { [Op.in]: itemIds }, idempotencyKey: { [Op.in]: expectedKeys } },
    transaction,
  });
  if (existingMovements.length === expectedKeys.length) return existingMovements;
  if (existingMovements.length) throw conflict('This order has an incomplete prior stock deduction and needs reconciliation.');
  const items = await InventoryItem.findAll({
    where: { id: { [Op.in]: itemIds }, restaurantId: order.restaurantId, branchId: order.branchId, isActive: true },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (items.length !== itemIds.length) throw conflict('A recipe references inventory that is inactive or outside this order branch.');
  const itemById = new Map(items.map((item) => [item.id, item]));
  for (const id of itemIds) {
    const item = itemById.get(id);
    const required = requirements.get(id).quantity;
    if (Number(item.quantityOnHand) + 1e-9 < required) throw conflict(`Insufficient ${item.name} stock to begin preparing this order.`);
  }

  const movements = [];
  for (const id of itemIds) {
    const item = itemById.get(id);
    const required = requirements.get(id).quantity;
    const after = Number((Number(item.quantityOnHand) - required).toFixed(3));
    await item.update({ quantityOnHand: after }, { transaction });
    let movementBalance = Number(item.quantityOnHand);
    for (const line of requirements.get(id).keys) {
      movementBalance = Number((movementBalance - line.quantity).toFixed(3));
      movements.push(await InventoryMovement.create({
        restaurantId: order.restaurantId,
        branchId: order.branchId,
        inventoryItemId: item.id,
        movementType: 'order_deduction',
        quantityChange: -line.quantity,
        quantityAfter: movementBalance,
        idempotencyKey: `order:${order.id}:${line.key}`,
        note: `Recipe stock for order ${order.id}`,
        actorUserId: actorUserId || null,
        createdAt: new Date(),
      }, { transaction }));
    }
  }
  return movements;
}

module.exports = { deductRecipeStockForOrder };

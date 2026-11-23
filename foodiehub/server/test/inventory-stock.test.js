'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OrderItem, InventoryRecipe, InventoryItem, InventoryMovement } = require('../src/models');
const { deductRecipeStockForOrder } = require('../src/services/inventory-stock');

function setup({ stock = 4, recipe = true, existing = [] } = {}) {
  const state = { stock, updates: 0, movements: [...existing] };
  const originals = {
    orderItems: OrderItem.findAll,
    recipes: InventoryRecipe.findAll,
    inventory: InventoryItem.findAll,
    movementFind: InventoryMovement.findAll,
    movementCreate: InventoryMovement.create,
  };
  OrderItem.findAll = async () => [{ id: 'order-item-1', menuItemId: 'menu-1', quantity: 2 }];
  InventoryRecipe.findAll = async () => recipe ? [{
    menuItemId: 'menu-1', yieldQuantity: 2,
    ingredients: [{ id: 'recipe-line-1', inventoryItemId: 'ingredient-1', quantity: 0.5 }],
  }] : [];
  InventoryItem.findAll = async () => [{
    id: 'ingredient-1', name: 'Flour', quantityOnHand: state.stock,
    async update(values) { state.updates += 1; state.stock = Number(values.quantityOnHand); Object.assign(this, values); },
  }];
  InventoryMovement.findAll = async ({ where }) => state.movements.filter((movement) => where.idempotencyKey[require('sequelize').Op.in].includes(movement.idempotencyKey));
  InventoryMovement.create = async (values) => { state.movements.push(values); return values; };
  return {
    state,
    restore() {
      OrderItem.findAll = originals.orderItems;
      InventoryRecipe.findAll = originals.recipes;
      InventoryItem.findAll = originals.inventory;
      InventoryMovement.findAll = originals.movementFind;
      InventoryMovement.create = originals.movementCreate;
    },
  };
}

const tx = { LOCK: { UPDATE: 'UPDATE' } };

test('preparing an order deducts recipe quantities and writes an idempotent stock ledger entry', async (t) => {
  const deps = setup();
  t.after(deps.restore);
  const order = { id: 'order-1', restaurantId: 'restaurant-1', branchId: 'branch-1' };
  const movements = await deductRecipeStockForOrder(order, tx, 'staff-1');
  assert.equal(deps.state.stock, 3.5);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantityChange, -0.5);
  assert.equal(movements[0].idempotencyKey, 'order:order-1:order-item-1:recipe-line-1');
});

test('replayed deduction with its complete ledger is idempotent', async (t) => {
  const prior = { idempotencyKey: 'order:order-1:order-item-1:recipe-line-1', quantityChange: -0.5 };
  const deps = setup({ existing: [prior] });
  t.after(deps.restore);
  const result = await deductRecipeStockForOrder({ id: 'order-1', restaurantId: 'restaurant-1', branchId: 'branch-1' }, tx, 'staff-1');
  assert.equal(result.length, 1);
  assert.equal(deps.state.updates, 0);
  assert.equal(deps.state.movements.length, 1);
});

test('insufficient recipe stock aborts before changing quantities or creating movements', async (t) => {
  const deps = setup({ stock: 0.2 });
  t.after(deps.restore);
  await assert.rejects(deductRecipeStockForOrder({ id: 'order-1', restaurantId: 'restaurant-1', branchId: 'branch-1' }, tx, 'staff-1'), { status: 409 });
  assert.equal(deps.state.stock, 0.2);
  assert.equal(deps.state.updates, 0);
  assert.equal(deps.state.movements.length, 0);
});

test('orders without configured recipes do not deduct stock', async (t) => {
  const deps = setup({ recipe: false });
  t.after(deps.restore);
  const result = await deductRecipeStockForOrder({ id: 'order-1', restaurantId: 'restaurant-1', branchId: 'branch-1' }, tx, 'staff-1');
  assert.deepEqual(result, []);
  assert.equal(deps.state.stock, 4);
  assert.equal(deps.state.updates, 0);
});

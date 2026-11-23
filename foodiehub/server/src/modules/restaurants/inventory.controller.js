'use strict';

const { Op } = require('sequelize');
const {
  Branch, MenuItem, InventoryItem, InventoryMovement, InventorySupplier,
  InventoryPurchaseOrder, InventoryPurchaseOrderItem, InventoryRecipe,
  InventoryRecipeIngredient,
} = require('../../models');

const fail = (status, message) => Object.assign(new Error(message), { status });
const send = (res, data, status = 200, message) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const hasPrecision = (value, digits) => new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`).test(String(value));
const positive = (value, max = 100000000) => value !== '' && hasPrecision(value, 3) && Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= max;
const nonNegative = (value, max = 100000000) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max;
const costValue = (value) => nonNegative(value, 99999999) && hasPrecision(value, 4);
const label = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
function indianMobile(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw fail(400, 'Enter a valid 10-digit Indian mobile number.');
  const compact = value.trim().replace(/[\s()-]/g, '');
  const digits = compact.startsWith('+91') ? compact.slice(3) : compact.startsWith('91') && compact.length === 12 ? compact.slice(2) : compact;
  if (!/^[6-9]\d{9}$/.test(digits)) throw fail(400, 'Enter a valid 10-digit Indian mobile number, optionally with +91.');
  return `+91${digits}`;
}

function assertBranchAccess(req, branchId) {
  if (req.restaurantBranchIds && !req.restaurantBranchIds.includes(branchId)) throw fail(403, 'You do not have access to this branch.');
}

async function findBranch(req, branchId, transaction) {
  if (!branchId) throw fail(400, 'Choose a branch.');
  assertBranchAccess(req, branchId);
  const branch = await Branch.findOne({ where: { id: branchId, restaurantId: req.restaurant.id }, transaction });
  if (!branch) throw fail(404, 'Branch not found.');
  return branch;
}

function scopedBranches(req, branchId) {
  if (branchId) assertBranchAccess(req, branchId);
  if (branchId) return branchId;
  return req.restaurantBranchIds ? { [Op.in]: req.restaurantBranchIds } : { [Op.ne]: null };
}

async function findItem(req, itemId, branchId, transaction, lock) {
  const where = { id: itemId, restaurantId: req.restaurant.id };
  if (branchId) where.branchId = branchId;
  const item = await InventoryItem.findOne({ where, transaction, lock, paranoid: false });
  if (!item) throw fail(404, 'Inventory item not found.');
  assertBranchAccess(req, item.branchId);
  return item;
}

exports.summary = handle(async (req, res) => {
  const branchId = req.query.branchId;
  const where = { restaurantId: req.restaurant.id, branchId: scopedBranches(req, branchId), isActive: true };
  const items = await InventoryItem.findAll({ where, attributes: ['id', 'quantityOnHand', 'reorderLevel', 'unitCost'] });
  send(res, {
    itemCount: items.length,
    lowStockCount: items.filter((item) => Number(item.quantityOnHand) <= Number(item.reorderLevel)).length,
    totalValue: Number(items.reduce((total, item) => total + Number(item.quantityOnHand) * Number(item.unitCost || 0), 0).toFixed(2)),
  });
});

exports.listItems = handle(async (req, res) => {
  const { branchId, lowStock, includeInactive } = req.query;
  if (includeInactive !== undefined && !['true', 'false'].includes(includeInactive)) throw fail(400, 'includeInactive must be true or false.');
  const where = { restaurantId: req.restaurant.id, branchId: scopedBranches(req, branchId), ...(includeInactive === 'true' ? {} : { isActive: true }) };
  const items = await InventoryItem.findAll({ where, include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'] }], order: [['name', 'ASC']] });
  const rows = lowStock === 'true' ? items.filter((item) => Number(item.quantityOnHand) <= Number(item.reorderLevel)) : items;
  send(res, rows);
});

exports.createItem = handle(async (req, res) => {
  const { branchId, name, sku, unit, openingQuantity = 0, reorderLevel = 0, unitCost = 0 } = req.body || {};
  if (!label(name, 150) || !label(sku, 60) || !label(unit, 24)) throw fail(400, 'Name, SKU, and unit are required.');
  if (!nonNegative(openingQuantity) || !hasPrecision(openingQuantity, 3) || !nonNegative(reorderLevel) || !hasPrecision(reorderLevel, 3) || !costValue(unitCost)) throw fail(400, 'Opening quantity, reorder level, or unit cost is invalid.');
  const transaction = await InventoryItem.sequelize.transaction();
  try {
    await findBranch(req, branchId, transaction);
    const item = await InventoryItem.create({ restaurantId: req.restaurant.id, branchId, name: name.trim(), sku: sku.trim(), unit: unit.trim(), quantityOnHand: Number(openingQuantity), reorderLevel: Number(reorderLevel), unitCost: Number(unitCost) }, { transaction });
    if (Number(openingQuantity) > 0) await InventoryMovement.create({ restaurantId: req.restaurant.id, branchId, inventoryItemId: item.id, movementType: 'opening', quantityChange: Number(openingQuantity), quantityAfter: Number(openingQuantity), idempotencyKey: `opening:${item.id}`, actorUserId: req.authUser.id, note: 'Opening balance', createdAt: new Date() }, { transaction });
    await transaction.commit();
    send(res, item, 201);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') throw fail(409, 'This SKU is already used in the selected branch.');
    throw error;
  }
});

exports.updateItem = handle(async (req, res) => {
  const { name, sku, unit, reorderLevel, unitCost, isActive } = req.body || {};
  const transaction = await InventoryItem.sequelize.transaction();
  let item;
  try {
  item = await findItem(req, req.params.itemId, undefined, transaction, transaction.LOCK.UPDATE);
  if (name !== undefined && !label(name, 150)) throw fail(400, 'Name is required (maximum 150 characters).');
  if (sku !== undefined && !label(sku, 60)) throw fail(400, 'SKU is required (maximum 60 characters).');
  if (unit !== undefined && !label(unit, 24)) throw fail(400, 'Unit is required (maximum 24 characters).');
  if (reorderLevel !== undefined && (!nonNegative(reorderLevel) || !hasPrecision(reorderLevel, 3))) throw fail(400, 'Reorder level must be non-negative with at most three decimal places.');
  if (unitCost !== undefined && !costValue(unitCost)) throw fail(400, 'Unit cost is invalid.');
  if (isActive !== undefined && typeof isActive !== 'boolean') throw fail(400, 'isActive must be boolean.');
  if (unit !== undefined && unit.trim() !== item.unit) {
    const [recipes, openPurchases, movements, allPurchases] = await Promise.all([
      InventoryRecipeIngredient.count({ include: [{ model: InventoryRecipe, as: 'recipe', where: { branchId: item.branchId, isActive: true }, required: true }], where: { inventoryItemId: item.id }, transaction }),
      InventoryPurchaseOrderItem.count({ include: [{ model: InventoryPurchaseOrder, as: 'purchaseOrder', where: { branchId: item.branchId, status: { [Op.in]: ['draft', 'ordered'] } }, required: true }], where: { inventoryItemId: item.id }, transaction }),
      InventoryMovement.count({ where: { inventoryItemId: item.id }, transaction }),
      InventoryPurchaseOrderItem.count({ where: { inventoryItemId: item.id }, transaction }),
    ]);
    if (recipes || openPurchases || movements || allPurchases) throw fail(409, 'Unit cannot change after stock history, a recipe, or a purchase order exists because historical quantities use the original unit.');
  }
  if (isActive === false) {
    const activeRecipeUse = await InventoryRecipeIngredient.count({ include: [{ model: InventoryRecipe, as: 'recipe', where: { branchId: item.branchId, isActive: true }, required: true }], where: { inventoryItemId: item.id }, transaction });
    const openPurchaseUse = await InventoryPurchaseOrderItem.count({ include: [{ model: InventoryPurchaseOrder, as: 'purchaseOrder', where: { branchId: item.branchId, status: { [Op.in]: ['draft', 'ordered'] } }, required: true }], where: { inventoryItemId: item.id }, transaction });
    if (activeRecipeUse || openPurchaseUse) throw fail(409, 'Ingredient cannot be deactivated while used by an active recipe or open purchase order.');
  }
  await item.update({ ...(name !== undefined ? { name: name.trim() } : {}), ...(sku !== undefined ? { sku: sku.trim() } : {}), ...(unit !== undefined ? { unit: unit.trim() } : {}), ...(reorderLevel !== undefined ? { reorderLevel } : {}), ...(unitCost !== undefined ? { unitCost } : {}), ...(isActive !== undefined ? { isActive } : {}) }, { transaction });
  await transaction.commit();
  send(res, item);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') throw fail(409, 'This SKU is already used in the selected branch.');
    throw error;
  }
});

exports.movements = handle(async (req, res) => {
  const { branchId, itemId } = req.query;
  const where = { restaurantId: req.restaurant.id, branchId: scopedBranches(req, branchId), ...(itemId ? { inventoryItemId: itemId } : {}) };
  if (itemId) await findItem(req, itemId, branchId);
  const rows = await InventoryMovement.findAll({ where, include: [{ model: InventoryItem, as: 'item', attributes: ['name', 'sku', 'unit'] }], order: [['createdAt', 'DESC']], limit: 200 });
  send(res, rows);
});

exports.menuItems = handle(async (req, res) => {
  const branchId = req.query.branchId;
  await findBranch(req, branchId);
  const rows = await MenuItem.findAll({ where: { restaurantId: req.restaurant.id }, attributes: ['id', 'name', 'price', 'isActive'], order: [['name', 'ASC']] });
  send(res, rows);
});

exports.adjustStock = handle(async (req, res) => {
  const { itemId, branchId, movementType, quantity, idempotencyKey, note } = req.body || {};
  if (!['adjustment_in', 'adjustment_out', 'wastage'].includes(movementType)) throw fail(400, 'Use adjustment_in, adjustment_out, or wastage.');
  if (!positive(quantity, 1000000)) throw fail(400, 'Quantity must be greater than zero.');
  if (!label(idempotencyKey, 120) || idempotencyKey.trim().length < 8) throw fail(400, 'Provide an idempotency key of 8 to 120 characters.');
  if (note != null && (typeof note !== 'string' || note.length > 500)) throw fail(400, 'Note must be 500 characters or fewer.');
  const delta = movementType === 'adjustment_in' ? Number(quantity) : -Number(quantity);
  const transaction = await InventoryItem.sequelize.transaction();
  try {
    const item = await findItem(req, itemId, branchId, transaction, transaction.LOCK.UPDATE);
    const existing = await InventoryMovement.findOne({ where: { inventoryItemId: item.id, idempotencyKey: idempotencyKey.trim() }, transaction });
    if (existing) {
      if (existing.movementType !== movementType || Number(existing.quantityChange) !== delta) throw fail(409, 'This idempotency key was already used for a different stock movement.');
      await transaction.commit();
      return send(res, existing, 200, 'Stock movement was already recorded.');
    }
    const after = Number(item.quantityOnHand) + delta;
    if (after < 0) throw fail(409, 'Stock cannot be reduced below zero.');
    await item.update({ quantityOnHand: after }, { transaction });
    const movement = await InventoryMovement.create({ restaurantId: req.restaurant.id, branchId: item.branchId, inventoryItemId: item.id, movementType, quantityChange: delta, quantityAfter: after, idempotencyKey: idempotencyKey.trim(), note: note?.trim() || null, actorUserId: req.authUser.id, createdAt: new Date() }, { transaction });
    await transaction.commit();
    send(res, movement, 201);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') throw fail(409, 'This stock movement was already recorded.');
    throw error;
  }
});

exports.listSuppliers = handle(async (req, res) => send(res, await InventorySupplier.findAll({ where: { restaurantId: req.restaurant.id }, order: [['name', 'ASC']] })));

exports.createSupplier = handle(async (req, res) => {
  const { name, contactName, email, phone, address } = req.body || {};
  if (!label(name, 150)) throw fail(400, 'Supplier name is required (maximum 150 characters).');
  if (contactName != null && contactName !== '' && !label(contactName, 150)) throw fail(400, 'Supplier contact name is invalid.');
  if (email != null && email !== '' && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150)) throw fail(400, 'Supplier email is invalid.');
  const normalizedPhone = indianMobile(phone);
  if (address != null && address !== '' && (typeof address !== 'string' || address.length > 500)) throw fail(400, 'Supplier address is invalid.');
  send(res, await InventorySupplier.create({ restaurantId: req.restaurant.id, name: name.trim(), contactName: contactName?.trim() || null, email: email?.trim() || null, phone: normalizedPhone, address: address?.trim() || null }), 201);
});

exports.updateSupplier = handle(async (req, res) => {
  const { name, contactName, email, phone, address, isActive } = req.body || {};
  const supplier = await InventorySupplier.findOne({ where: { id: req.params.supplierId, restaurantId: req.restaurant.id } });
  if (!supplier) throw fail(404, 'Supplier not found.');
  if (name !== undefined && !label(name, 150)) throw fail(400, 'Supplier name is required (maximum 150 characters).');
  if (contactName !== undefined && contactName !== '' && !label(contactName, 150)) throw fail(400, 'Supplier contact name is invalid.');
  if (email !== undefined && email !== '' && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150)) throw fail(400, 'Supplier email is invalid.');
  const normalizedPhone = phone !== undefined ? indianMobile(phone) : undefined;
  if (address !== undefined && address !== '' && (typeof address !== 'string' || address.length > 500)) throw fail(400, 'Supplier address is invalid.');
  if (isActive !== undefined && typeof isActive !== 'boolean') throw fail(400, 'isActive must be boolean.');
  await supplier.update({ ...(name !== undefined ? { name: name.trim() } : {}), ...(contactName !== undefined ? { contactName: contactName.trim() || null } : {}), ...(email !== undefined ? { email: email.trim() || null } : {}), ...(phone !== undefined ? { phone: normalizedPhone } : {}), ...(address !== undefined ? { address: address.trim() || null } : {}), ...(isActive !== undefined ? { isActive } : {}) });
  send(res, supplier);
});

exports.createPurchaseOrder = handle(async (req, res) => {
  const { branchId, supplierId, reference, items } = req.body || {};
  if (!label(reference, 60)) throw fail(400, 'Purchase order reference is required (maximum 60 characters).');
  if (!Array.isArray(items) || !items.length || items.length > 100) throw fail(400, 'Add between 1 and 100 purchase order lines.');
  const transaction = await InventoryPurchaseOrder.sequelize.transaction();
  try {
    await findBranch(req, branchId, transaction);
    const supplier = await InventorySupplier.findOne({ where: { id: supplierId, restaurantId: req.restaurant.id, isActive: true }, transaction });
    if (!supplier) throw fail(404, 'Supplier not found.');
    const normalized = [];
    const seen = new Set();
    for (const line of items) {
      if (!line || typeof line.itemId !== 'string' || !positive(line.quantity, 1000000) || !costValue(line.unitCost)) throw fail(400, 'Each purchase line needs an item, positive quantity, and non-negative unit cost.');
      if (seen.has(line.itemId)) throw fail(400, 'Each inventory item can appear only once in a purchase order.');
      seen.add(line.itemId);
      const item = await InventoryItem.findOne({ where: { id: line.itemId, restaurantId: req.restaurant.id, branchId, isActive: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (!item) throw fail(404, 'A purchase line references an item outside this branch.');
      normalized.push({ item, quantity: Number(line.quantity), unitCost: Number(line.unitCost) });
    }
    const totalCents = normalized.reduce((sum, line) => sum + Math.round(line.quantity * line.unitCost * 100), 0);
    const order = await InventoryPurchaseOrder.create({ restaurantId: req.restaurant.id, branchId, supplierId, reference: reference.trim(), status: 'draft', totalAmount: totalCents / 100, createdByUserId: req.authUser.id }, { transaction });
    for (const line of normalized) await InventoryPurchaseOrderItem.create({ purchaseOrderId: order.id, inventoryItemId: line.item.id, quantity: line.quantity, unitCost: line.unitCost, lineTotal: Math.round(line.quantity * line.unitCost * 100) / 100 }, { transaction });
    await transaction.commit();
    send(res, order, 201);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') throw fail(409, 'That purchase order reference is already used in this branch.');
    throw error;
  }
});

exports.listPurchaseOrders = handle(async (req, res) => {
  const { branchId } = req.query;
  const orders = await InventoryPurchaseOrder.findAll({ where: { restaurantId: req.restaurant.id, branchId: scopedBranches(req, branchId) }, include: [{ model: InventorySupplier, as: 'supplier', attributes: ['id', 'name'] }, { model: InventoryPurchaseOrderItem, as: 'items', include: [{ model: InventoryItem, as: 'inventoryItem', attributes: ['id', 'name', 'sku', 'unit'] }] }], order: [['createdAt', 'DESC']], limit: 200 });
  send(res, orders);
});

exports.updatePurchaseOrder = handle(async (req, res) => {
  const { status, branchId } = req.body || {};
  if (!['ordered', 'cancelled'].includes(status)) throw fail(400, 'Status must be ordered or cancelled.');
  const transaction = await InventoryPurchaseOrder.sequelize.transaction();
  try {
    const order = await InventoryPurchaseOrder.findOne({ where: { id: req.params.orderId, restaurantId: req.restaurant.id, ...(branchId ? { branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) throw fail(404, 'Purchase order not found.');
    assertBranchAccess(req, order.branchId);
    if (order.status !== 'draft') throw fail(409, 'Only draft purchase orders can be placed or cancelled.');
    await order.update({ status, ...(status === 'ordered' ? { orderedAt: new Date() } : {}) }, { transaction });
    await transaction.commit();
    send(res, order);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
});

exports.receivePurchaseOrder = handle(async (req, res) => {
  const transaction = await InventoryPurchaseOrder.sequelize.transaction();
  try {
    const order = await InventoryPurchaseOrder.findOne({ where: { id: req.params.orderId, restaurantId: req.restaurant.id }, include: [{ model: InventoryPurchaseOrderItem, as: 'items' }], transaction, lock: transaction.LOCK.UPDATE });
    if (!order) throw fail(404, 'Purchase order not found.');
    assertBranchAccess(req, order.branchId);
    if (order.status !== 'ordered') throw fail(409, 'Only an ordered purchase order can be received.');
    if (!order.items?.length) throw fail(409, 'A purchase order without lines cannot be received.');
    for (const line of order.items) {
      const item = await InventoryItem.findOne({ where: { id: line.inventoryItemId, restaurantId: req.restaurant.id, branchId: order.branchId, isActive: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (!item) throw fail(409, 'A purchase order item is no longer active in its branch.');
      const after = Number(item.quantityOnHand) + Number(line.quantity);
      await item.update({ quantityOnHand: after, unitCost: line.unitCost }, { transaction });
      await InventoryMovement.create({ restaurantId: req.restaurant.id, branchId: order.branchId, inventoryItemId: item.id, movementType: 'purchase_receipt', quantityChange: line.quantity, quantityAfter: after, idempotencyKey: `purchase:${order.id}:${line.id}`, note: `Purchase order ${order.reference}`, actorUserId: req.authUser.id, createdAt: new Date() }, { transaction });
    }
    await order.update({ status: 'received', receivedAt: new Date() }, { transaction });
    await transaction.commit();
    send(res, order, 200, 'Purchase received and stock updated.');
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') throw fail(409, 'This purchase order receipt was already applied.');
    throw error;
  }
});

exports.getRecipe = handle(async (req, res) => {
  const { branchId, menuItemId } = req.params;
  await findBranch(req, branchId);
  const menuItem = await MenuItem.findOne({ where: { id: menuItemId, restaurantId: req.restaurant.id } });
  if (!menuItem) throw fail(404, 'Menu item not found.');
  const recipe = await InventoryRecipe.findOne({ where: { restaurantId: req.restaurant.id, branchId, menuItemId, isActive: true }, include: [{ model: InventoryRecipeIngredient, as: 'ingredients', include: [{ model: InventoryItem, as: 'inventoryItem', attributes: ['id', 'name', 'unit', 'unitCost'] }] }] });
  if (!recipe) return send(res, null);
  const ingredientCost = recipe.ingredients.reduce((total, line) => total + Number(line.quantity) * Number(line.inventoryItem?.unitCost || 0), 0);
  const perServingCost = ingredientCost / Number(recipe.yieldQuantity);
  const sellingPrice = Number(menuItem.price);
  send(res, {
    ...recipe.toJSON(),
    costEstimate: {
      ingredientCostPerYield: Number(ingredientCost.toFixed(2)),
      ingredientCostPerServing: Number(perServingCost.toFixed(2)),
      menuPrice: sellingPrice,
      foodCostPercentage: sellingPrice > 0 ? Number(((perServingCost / sellingPrice) * 100).toFixed(2)) : null,
      grossMarginBeforeOtherCosts: Number((sellingPrice - perServingCost).toFixed(2)),
      estimateDisclaimer: 'Ingredient costs use the latest recorded unit costs; labor, tax, packaging and overhead are excluded.',
    },
  });
});

exports.saveRecipe = handle(async (req, res) => {
  const { branchId, menuItemId } = req.params;
  const { yieldQuantity = 1, ingredients } = req.body || {};
  if (!positive(yieldQuantity, 1000000)) throw fail(400, 'Recipe yield must be greater than zero.');
  if (!Array.isArray(ingredients) || !ingredients.length || ingredients.length > 100) throw fail(400, 'Add between 1 and 100 recipe ingredients.');
  await findBranch(req, branchId);
  const menuItem = await MenuItem.findOne({ where: { id: menuItemId, restaurantId: req.restaurant.id } });
  if (!menuItem) throw fail(404, 'Menu item not found.');
  const transaction = await InventoryRecipe.sequelize.transaction();
  try {
    const seen = new Set();
    const rows = [];
    for (const line of ingredients) {
      if (!line || typeof line.itemId !== 'string' || !positive(line.quantity, 1000000) || seen.has(line.itemId)) throw fail(400, 'Each recipe needs unique inventory items with positive quantities.');
      seen.add(line.itemId);
      const item = await InventoryItem.findOne({ where: { id: line.itemId, restaurantId: req.restaurant.id, branchId, isActive: true }, transaction });
      if (!item) throw fail(404, 'Recipe ingredient must be active inventory in the selected branch.');
      rows.push({ item, quantity: Number(line.quantity) });
    }
    let recipe = await InventoryRecipe.findOne({ where: { restaurantId: req.restaurant.id, branchId, menuItemId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!recipe) recipe = await InventoryRecipe.create({ restaurantId: req.restaurant.id, branchId, menuItemId, yieldQuantity: Number(yieldQuantity) }, { transaction });
    else await recipe.update({ yieldQuantity: Number(yieldQuantity), isActive: true }, { transaction });
    await InventoryRecipeIngredient.destroy({ where: { recipeId: recipe.id }, transaction });
    for (const row of rows) await InventoryRecipeIngredient.create({ recipeId: recipe.id, inventoryItemId: row.item.id, quantity: row.quantity }, { transaction });
    await transaction.commit();
    send(res, recipe, 200);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
});

exports.deleteRecipe = handle(async (req, res) => {
  const { branchId, menuItemId } = req.params;
  await findBranch(req, branchId);
  const recipe = await InventoryRecipe.findOne({ where: { restaurantId: req.restaurant.id, branchId, menuItemId, isActive: true } });
  if (!recipe) throw fail(404, 'Active recipe not found.');
  await recipe.update({ isActive: false });
  send(res, { id: recipe.id, isActive: false }, 200, 'Recipe deactivated; prior stock movements were preserved.');
});

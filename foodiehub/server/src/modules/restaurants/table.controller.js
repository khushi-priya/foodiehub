const { Op } = require('sequelize');
const { RestaurantTable, Branch, Restaurant, RestaurantMember, User, Order, Reservation } = require('../../models');
const { ensureRestaurantQr, buildRestaurantQrPayload } = require('../../utils/restaurant-qr');
const { emitFloorEvent } = require('../../services/table-operations');

const fail = (status, message) => Object.assign(new Error(message), { status });
const safeAttributes = ['id', 'restaurantId', 'branchId', 'tableNumber', 'seatingCapacity', 'isActive', 'occupancyStatus', 'assignedWaiterMemberId', 'createdAt', 'updatedAt'];
const response = (res, data, status = 200) => res.status(status).json({ success: true, data });
const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ success: false, message: 'That table number is already used in this branch.' });
    next(error);
  }
};

function assertBranchAccess(req, branchId) {
  if (req.restaurantBranchIds && !req.restaurantBranchIds.includes(branchId)) throw fail(403, 'You do not have access to this branch.');
}

async function authorizedBranch(branchId, restaurantId, req) {
  if (typeof branchId !== 'string' || !branchId.trim()) throw fail(400, 'Choose a branch for this table.');
  if (req) assertBranchAccess(req, branchId);
  const branch = await Branch.findOne({ where: { id: branchId, restaurantId } });
  if (!branch) throw fail(404, 'Branch not found in your restaurant.');
  return branch;
}

function validateTable(body) {
  if (typeof body.tableNumber !== 'string' || !body.tableNumber.trim() || body.tableNumber.trim().length > 50) throw fail(400, 'Enter a table number or name (up to 50 characters).');
  const capacity = Number(body.seatingCapacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) throw fail(400, 'Seating capacity must be a whole number from 1 to 100.');
  return { tableNumber: body.tableNumber.trim(), seatingCapacity: capacity };
}

async function findTable(req) {
  const table = await RestaurantTable.findOne({
    where: { id: req.params.tableId, restaurantId: req.restaurant.id },
    attributes: [...safeAttributes, 'qrToken'],
    include: [
      { model: Branch, as: 'branch', attributes: ['id', 'name', 'city'], required: true },
      { model: RestaurantMember, as: 'assignedWaiter', attributes: ['id'], required: false, include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }] },
      { model: Order, as: 'orders', where: { orderType: 'dine_in', status: { [Op.in]: ['pending', 'accepted', 'preparing', 'ready'] }, paymentStatus: { [Op.ne]: 'failed' } }, attributes: ['id', 'orderNumber', 'status'], required: false },
      { model: Reservation, as: 'reservations', where: { status: { [Op.in]: ['pending', 'confirmed', 'checked_in', 'seated'] }, endsAt: { [Op.gt]: new Date() } }, attributes: ['id', 'guestName', 'guestPhone', 'guestEmail', 'partySize', 'startsAt', 'endsAt', 'status'], required: false, include: [{ model: Branch, as: 'branch', attributes: ['timeZone'], required: false }] },
    ],
  });
  if (!table) throw fail(404, 'Table not found.');
  assertBranchAccess(req, table.branchId);
  const result = table.toJSON();
  result.assignedWaiter = table.assignedWaiter?.user ? {
    id: table.assignedWaiter.id,
    name: [table.assignedWaiter.user.firstName, table.assignedWaiter.user.lastName].filter(Boolean).join(' ') || table.assignedWaiter.user.email,
  } : null;
  const sharedQr = await ensureRestaurantQr(req.restaurant.id);
  result.qrAvailable = Boolean(sharedQr.qrToken && table.isActive);
  delete result.qrToken;
  return result;
}

async function getQrTable(req) {
  const table = await RestaurantTable.findOne({
    where: { id: req.params.tableId, restaurantId: req.restaurant.id },
    include: [{ model: Branch, as: 'branch', required: true }],
  });
  if (!table) throw fail(404, 'Table not found.');
  assertBranchAccess(req, table.branchId);
  if (!table.isActive) throw fail(409, 'Activate this table before generating a QR code.');
  const restaurant = await Restaurant.findOne({ where: { id: req.restaurant.id, approvalStatus: 'approved', listingStatus: 'published', marketplaceEnabled: true }, attributes: ['id'] });
  if (!restaurant) throw fail(409, 'Publish and enable your approved restaurant before issuing a public table QR code.');
  const branch = await Branch.findOne({ where: { id: table.branchId, restaurantId: restaurant.id, isActive: true, dineInEnabled: true, operationalStatus: { [Op.notIn]: ['inactive', 'temporarily_closed'] }, approvalStatus: 'approved' }, attributes: ['id'] });
  if (!branch) throw fail(409, 'This table needs an active, approved dine-in branch before a QR code can be issued.');
  return table;
}

exports.qr = handle(async (req, res) => {
  const table = await getQrTable(req);
  response(res, await buildRestaurantQrPayload(req.restaurant.id));
});

exports.generateQr = handle(async (req, res) => {
  if (req.body?.regenerate !== undefined && typeof req.body.regenerate !== 'boolean') throw fail(400, 'regenerate must be true or false.');
  await getQrTable(req);
  response(res, await buildRestaurantQrPayload(req.restaurant.id));
});

exports.qrSheet = handle(async (req, res) => {
  const where = { restaurantId: req.restaurant.id, isActive: true };
  if (req.query.branchId) {
    await authorizedBranch(req.query.branchId, req.restaurant.id, req);
    where.branchId = req.query.branchId;
  } else if (req.restaurantBranchIds) where.branchId = { [Op.in]: req.restaurantBranchIds };
  const candidates = await RestaurantTable.findAll({
    where,
    attributes: ['id'],
  });
  for (const candidate of candidates) await getQrTable({ ...req, params: { ...req.params, tableId: candidate.id } });
  const tables = await RestaurantTable.findAll({ where, attributes: ['id', 'restaurantId', 'branchId', 'tableNumber'], include: [{ model: Branch, as: 'branch', attributes: ['name'], required: true }], order: [['branchId', 'ASC'], ['tableNumber', 'ASC']] });
  for (const table of tables) await getQrTable({ ...req, params: { ...req.params, tableId: table.id } });
  const sharedQr = await buildRestaurantQrPayload(req.restaurant.id);
  response(res, { tables: tables.map((table) => ({ tableNumber: table.tableNumber, branchName: table.branch.name, ...sharedQr })), newlyGeneratedCount: 0 });
});

exports.list = handle(async (req, res) => {
  const { qrToken } = await ensureRestaurantQr(req.restaurant.id);
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const where = { restaurantId: req.restaurant.id };
  if (req.query.branchId) {
    await authorizedBranch(req.query.branchId, req.restaurant.id, req);
    where.branchId = req.query.branchId;
  } else if (req.restaurantBranchIds) where.branchId = { [Op.in]: req.restaurantBranchIds };
  if (req.query.search) {
    const search = String(req.query.search).trim().slice(0, 50);
    if (search) where.tableNumber = { [Op.like]: `%${search}%` };
  }
  if (req.query.status === 'active') where.isActive = true;
  else if (req.query.status === 'inactive') where.isActive = false;
  else if (req.query.status && req.query.status !== 'all') throw fail(400, 'Invalid table status filter.');
  const result = await RestaurantTable.findAndCountAll({
    where, attributes: [...safeAttributes, 'qrToken'],
    include: [
      { model: Branch, as: 'branch', attributes: ['id', 'name', 'city'], required: true },
      { model: RestaurantMember, as: 'assignedWaiter', attributes: ['id'], required: false, include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }] },
      { model: Order, as: 'orders', where: { orderType: 'dine_in', status: { [Op.in]: ['pending', 'accepted', 'preparing', 'ready'] }, paymentStatus: { [Op.ne]: 'failed' } }, attributes: ['id', 'orderNumber', 'status'], required: false },
      { model: Reservation, as: 'reservations', where: { status: { [Op.in]: ['pending', 'confirmed', 'checked_in', 'seated'] }, endsAt: { [Op.gt]: new Date() } }, attributes: ['id', 'guestName', 'guestPhone', 'guestEmail', 'partySize', 'startsAt', 'endsAt', 'status'], required: false, include: [{ model: Branch, as: 'branch', attributes: ['timeZone'], required: false }] },
    ],
    order: [['branchId', 'ASC'], ['tableNumber', 'ASC']], limit, offset: (page - 1) * limit,
  });
  const tables = result.rows.map((table) => { const value = table.toJSON(); value.qrAvailable = Boolean(qrToken && table.isActive); value.assignedWaiter = table.assignedWaiter?.user ? { id: table.assignedWaiter.id, name: [table.assignedWaiter.user.firstName, table.assignedWaiter.user.lastName].filter(Boolean).join(' ') || table.assignedWaiter.user.email } : null; delete value.qrToken; return value; });
  response(res, { tables, pagination: { total: result.count, page, limit, totalPages: Math.ceil(result.count / limit) } });
});

exports.create = handle(async (req, res) => {
  const values = validateTable(req.body || {});
  const branch = await authorizedBranch(req.body.branchId, req.restaurant.id, req);
  const table = await RestaurantTable.create({ ...values, restaurantId: req.restaurant.id, branchId: branch.id, isActive: true, occupancyStatus: 'available', qrToken: null });
  emitFloorEvent(req, branch.id, 'floor:occupancy-updated', { tableId: table.id, status: 'available' });
  response(res, await findTable({ restaurant: req.restaurant, params: { tableId: table.id } }), 201);
});

exports.details = handle(async (req, res) => response(res, await findTable(req)));

exports.update = handle(async (req, res) => {
  const table = await RestaurantTable.findOne({ where: { id: req.params.tableId, restaurantId: req.restaurant.id } });
  if (!table) throw fail(404, 'Table not found.');
  assertBranchAccess(req, table.branchId);
  const values = validateTable(req.body || {});
  const branch = await authorizedBranch(req.body.branchId, req.restaurant.id, req);
  const oldBranchId = table.branchId;
  if (oldBranchId !== branch.id) {
    const [openOrders, activeReservations] = await Promise.all([
      Order.count({ where: { tableId: table.id, status: { [Op.in]: ['pending', 'accepted', 'preparing', 'ready'] }, paymentStatus: { [Op.ne]: 'failed' } } }),
      Reservation.count({ where: { tableId: table.id, status: { [Op.in]: ['pending', 'confirmed', 'checked_in', 'seated'] }, endsAt: { [Op.gt]: new Date() } } }),
    ]);
    if (openOrders || activeReservations) throw fail(409, 'A table with an active dine-in order or reservation cannot change branches.');
  }
  await table.update({ ...values, branchId: branch.id });
  if (oldBranchId !== branch.id) emitFloorEvent(req, oldBranchId, 'floor:occupancy-updated', { tableId: table.id, status: 'available' });
  emitFloorEvent(req, branch.id, 'floor:occupancy-updated', { tableId: table.id, status: table.occupancyStatus });
  response(res, await findTable({ restaurant: req.restaurant, params: { tableId: table.id } }));
});

exports.status = handle(async (req, res) => {
  if (typeof req.body?.isActive !== 'boolean') throw fail(400, 'isActive must be true or false.');
  const table = await RestaurantTable.findOne({ where: { id: req.params.tableId, restaurantId: req.restaurant.id } });
  if (!table) throw fail(404, 'Table not found.');
  assertBranchAccess(req, table.branchId);
  if (!req.body.isActive) {
    const [openOrders, activeReservations] = await Promise.all([
      Order.count({ where: { tableId: table.id, status: { [Op.in]: ['pending', 'accepted', 'preparing', 'ready'] }, paymentStatus: { [Op.ne]: 'failed' } } }),
      Reservation.count({ where: { tableId: table.id, status: { [Op.in]: ['pending', 'confirmed', 'checked_in', 'seated'] }, endsAt: { [Op.gt]: new Date() } } }),
    ]);
    if (openOrders || activeReservations) throw fail(409, 'A table with an active dine-in order or reservation cannot be deactivated.');
  }
  await table.update({ isActive: req.body.isActive, occupancyStatus: req.body.isActive ? 'available' : 'inactive', ...(req.body.isActive ? {} : { assignedWaiterMemberId: null }) });
  emitFloorEvent(req, table.branchId, 'floor:occupancy-updated', { tableId: table.id, status: table.occupancyStatus });
  response(res, await findTable({ restaurant: req.restaurant, params: { tableId: table.id } }));
});

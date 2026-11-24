const { Op } = require('sequelize');
const { Branch, RestaurantTable, RestaurantMember, Role, EmployeeBranchAssignment, Reservation, Order, User, TableOperationEvent } = require('../../models');
const { emitFloorEvent, emitCustomerReservationEvent, updateOccupancy, ACTIVE_ORDER_STATUSES } = require('../../services/table-operations');
const { createCustomerNotification } = require('../../services/customer-notifications');
const { createRestaurantNotification } = require('../../services/restaurant-notifications');
const { reservationTransitionAllowed, branchInScope } = require('../../services/floor-policy');
const { reservationFitsBranchHours, localDateTimeToInstant } = require('../../services/branch-availability');

const fail = (status, message) => Object.assign(new Error(message), { status });
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const busyStatuses = ['pending', 'confirmed', 'checked_in', 'seated'];
const terminalOrders = ['completed', 'rejected', 'cancelled'];

function assertBranchScope(req, branchId, restaurantId = req.restaurant.id) {
  if (!branchId || !branchInScope(req.restaurant.id, restaurantId, req.restaurantBranchIds, branchId)) throw fail(403, 'You do not have access to this branch.');
}

async function findTable(req, transaction, lock = false) {
  const table = await RestaurantTable.findOne({
    where: { id: req.params.tableId, restaurantId: req.restaurant.id },
    transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!table) throw fail(404, 'Table not found.');
  assertBranchScope(req, table.branchId, table.restaurantId);
  return table;
}

async function logOperation(req, transaction, values) {
  return TableOperationEvent.create({ restaurantId: req.restaurant.id, branchId: values.branchId, actorMemberId: req.restaurantMembership.id, ...values }, { transaction });
}

exports.listTables = handle(async (req, res) => {
  const where = { restaurantId: req.restaurant.id };
  if (req.query.branchId) {
    assertBranchScope(req, req.query.branchId);
    where.branchId = req.query.branchId;
  } else if (req.restaurantBranchIds) where.branchId = { [Op.in]: req.restaurantBranchIds };
  if (req.restaurantRole === 'waiter') where.assignedWaiterMemberId = req.restaurantMembership.id;
  const tables = await RestaurantTable.findAll({
    where,
    include: [
      { model: Branch, as: 'branch', attributes: ['id', 'name'], required: true },
      { model: RestaurantMember, as: 'assignedWaiter', attributes: ['id', 'userId'], required: false, include: [{ model: Role, as: 'role', attributes: ['code'] }] },
      { model: Order, as: 'orders', where: { orderType: 'dine_in', status: { [Op.in]: ACTIVE_ORDER_STATUSES }, paymentStatus: { [Op.ne]: 'failed' } }, attributes: ['id', 'orderNumber', 'status', 'total'], required: false },
    ],
    order: [['branchId', 'ASC'], ['tableNumber', 'ASC']],
  });
  send(res, tables);
});

exports.listWaiters = handle(async (req, res) => {
  const branchId = req.query.branchId;
  assertBranchScope(req, branchId);
  const waiters = await RestaurantMember.findAll({
    where: { restaurantId: req.restaurant.id, status: 'active' },
    attributes: ['id'],
    include: [
      { model: Role, as: 'role', where: { code: 'waiter', scope: 'restaurant' }, attributes: ['code'], required: true },
      { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'], required: true },
      { model: EmployeeBranchAssignment, as: 'branchAssignments', where: { branchId, status: 'active' }, attributes: ['id'], required: true },
    ],
  });
  send(res, waiters.map((waiter) => ({ id: waiter.id, name: [waiter.user.firstName, waiter.user.lastName].filter(Boolean).join(' ') || waiter.user.email })));
});

exports.listBranches = handle(async (req, res) => {
  const where = { restaurantId: req.restaurant.id };
  if (req.restaurantBranchIds) where.id = { [Op.in]: req.restaurantBranchIds };
  const branches = await Branch.findAll({ where, attributes: ['id', 'name', 'city', 'isActive', 'approvalStatus', 'operationalStatus', 'dineInEnabled', 'openingTime', 'closingTime', 'timeZone', 'workingDays', 'closedDays', 'overnight'], order: [['name', 'ASC']] });
  send(res, branches);
});

exports.assignWaiter = handle(async (req, res) => {
  const waiterMemberId = req.body?.waiterMemberId || null;
  const transaction = await RestaurantTable.sequelize.transaction();
  try {
    const table = await findTable(req, transaction, true);
    if (waiterMemberId) {
      const waiter = await RestaurantMember.findOne({
        where: { id: waiterMemberId, restaurantId: req.restaurant.id, status: 'active' },
        include: [
          { model: Role, as: 'role', where: { code: 'waiter', scope: 'restaurant' }, required: true },
          { model: EmployeeBranchAssignment, as: 'branchAssignments', where: { branchId: table.branchId, status: 'active' }, required: true },
        ],
        transaction,
      });
      if (!waiter) throw fail(400, 'Select an active waiter assigned to this branch.');
    }
    await table.update({ assignedWaiterMemberId: waiterMemberId }, { transaction });
    await logOperation(req, transaction, { branchId: table.branchId, tableId: table.id, operation: 'waiter_assignment', metadata: { waiterMemberId } });
    await transaction.commit();
    emitFloorEvent(req, table.branchId, 'floor:waiter-assigned', { tableId: table.id, waiterMemberId });
    send(res, { id: table.id, assignedWaiterMemberId: waiterMemberId });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
});

exports.setOccupancy = handle(async (req, res) => {
  const status = req.body?.status;
  if (!['available', 'occupied', 'cleaning'].includes(status)) throw fail(400, 'Choose available, occupied, or cleaning.');
  const transaction = await RestaurantTable.sequelize.transaction();
  try {
    const table = await findTable(req, transaction, true);
    if (!table.isActive) throw fail(409, 'Inactive tables cannot change occupancy.');
    if (status === 'occupied' && !['available', 'occupied'].includes(table.occupancyStatus)) throw fail(409, `A ${table.occupancyStatus} table cannot be marked occupied directly.`);
    if (status !== 'occupied' || table.occupancyStatus !== 'occupied') {
      const [openOrders, reservations] = await Promise.all([
        Order.count({ where: { tableId: table.id, status: { [Op.in]: ACTIVE_ORDER_STATUSES }, paymentStatus: { [Op.ne]: 'failed' } }, transaction }),
        Reservation.count({ where: { tableId: table.id, status: { [Op.in]: busyStatuses }, endsAt: { [Op.gt]: new Date() } }, transaction }),
      ]);
      if (status === 'occupied' && reservations) throw fail(409, 'A table assigned to an active reservation must be marked occupied through the reservation seating workflow.');
      if (status !== 'occupied' && (openOrders || reservations)) throw fail(409, 'This table still has an active order or reservation.');
    }
    await table.update({ occupancyStatus: status }, { transaction });
    await logOperation(req, transaction, { branchId: table.branchId, tableId: table.id, operation: 'status', metadata: { status } });
    await transaction.commit();
    emitFloorEvent(req, table.branchId, 'floor:occupancy-updated', { tableId: table.id, status });
    send(res, { id: table.id, occupancyStatus: status });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
});

exports.transferOrder = handle(async (req, res) => {
  const targetTableId = req.body?.targetTableId;
  if (!targetTableId || targetTableId === req.body?.sourceTableId) throw fail(400, 'Choose a different destination table.');
  const transaction = await Order.sequelize.transaction();
  try {
    const order = await Order.findOne({ where: { id: req.params.orderId, restaurantId: req.restaurant.id, orderType: 'dine_in', status: { [Op.in]: ACTIVE_ORDER_STATUSES } }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) throw fail(404, 'Active dine-in order not found.');
    assertBranchScope(req, order.branchId);
    const [source, target] = await Promise.all([
      RestaurantTable.findOne({ where: { id: order.tableId, restaurantId: req.restaurant.id, branchId: order.branchId }, transaction, lock: transaction.LOCK.UPDATE }),
      RestaurantTable.findOne({ where: { id: targetTableId, restaurantId: req.restaurant.id, branchId: order.branchId, isActive: true, occupancyStatus: 'available' }, transaction, lock: transaction.LOCK.UPDATE }),
    ]);
    if (!source || !target) throw fail(409, 'Source or destination table is unavailable in this branch.');
    await order.update({ tableId: target.id }, { transaction });
    await updateOccupancy(source, transaction);
    await target.update({ occupancyStatus: 'occupied' }, { transaction });
    await logOperation(req, transaction, { branchId: source.branchId, tableId: source.id, relatedTableId: target.id, orderId: order.id, operation: 'transfer' });
    await transaction.commit();
    emitFloorEvent(req, order.branchId, 'floor:table-transferred', { orderId: order.id, fromTableId: source.id, toTableId: target.id });
    send(res, { orderId: order.id, tableId: target.id });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
});

exports.mergeTable = handle(async (req, res) => {
  const targetTableId = req.body?.targetTableId;
  if (!targetTableId || targetTableId === req.params.tableId) throw fail(400, 'Choose a different table to merge into.');
  const transaction = await Order.sequelize.transaction();
  try {
    const source = await findTable({ ...req, params: { ...req.params, tableId: req.params.tableId } }, transaction, true);
    const target = await RestaurantTable.findOne({ where: { id: targetTableId, restaurantId: req.restaurant.id, branchId: source.branchId, isActive: true, occupancyStatus: { [Op.in]: ['available', 'occupied'] } }, transaction, lock: transaction.LOCK.UPDATE });
    if (!target || source.occupancyStatus !== 'occupied') throw fail(409, 'Both tables must be active in this branch and the source must be occupied.');
    const reservations = await Reservation.count({ where: { tableId: source.id, status: { [Op.in]: busyStatuses }, endsAt: { [Op.gt]: new Date() } }, transaction });
    if (reservations) throw fail(409, 'A table with an active reservation cannot be merged.');
    const orders = await Order.findAll({ where: { tableId: source.id, orderType: 'dine_in', status: { [Op.in]: ACTIVE_ORDER_STATUSES }, paymentStatus: { [Op.ne]: 'failed' } }, transaction, lock: transaction.LOCK.UPDATE });
    if (!orders.length) throw fail(409, 'There are no active dine-in orders on this table.');
    for (const order of orders) await order.update({ tableId: target.id }, { transaction });
    await source.update({ occupancyStatus: 'available' }, { transaction });
    await target.update({ occupancyStatus: 'occupied' }, { transaction });
    await logOperation(req, transaction, { branchId: source.branchId, tableId: source.id, relatedTableId: target.id, operation: 'merge', metadata: { orderIds: orders.map((order) => order.id) } });
    await transaction.commit();
    emitFloorEvent(req, source.branchId, 'floor:tables-merged', { sourceTableId: source.id, targetTableId: target.id, orderIds: orders.map((order) => order.id) });
    send(res, { sourceTableId: source.id, targetTableId: target.id, movedOrders: orders.length });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
});

exports.splitTable = handle(async (req, res) => {
  const { targetTableId, orderIds } = req.body || {};
  if (!targetTableId || !Array.isArray(orderIds) || !orderIds.length || orderIds.some((id) => typeof id !== 'string')) throw fail(400, 'Select a destination table and at least one active order to split.');
  const transaction = await Order.sequelize.transaction();
  try {
    const source = await findTable(req, transaction, true);
    assertBranchScope(req, source.branchId);
    const target = await RestaurantTable.findOne({ where: { id: targetTableId, restaurantId: req.restaurant.id, branchId: source.branchId, isActive: true, occupancyStatus: 'available' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!target) throw fail(409, 'Choose an available destination table in the same branch.');
    const orders = await Order.findAll({ where: { id: { [Op.in]: orderIds }, restaurantId: req.restaurant.id, branchId: source.branchId, tableId: source.id, orderType: 'dine_in', status: { [Op.in]: ACTIVE_ORDER_STATUSES }, paymentStatus: { [Op.ne]: 'failed' } }, transaction, lock: transaction.LOCK.UPDATE });
    if (orders.length !== new Set(orderIds).size) throw fail(409, 'One or more selected orders are no longer active on this table.');
    for (const order of orders) await order.update({ tableId: target.id }, { transaction });
    await updateOccupancy(source, transaction);
    await target.update({ occupancyStatus: 'occupied' }, { transaction });
    await logOperation(req, transaction, { branchId: source.branchId, tableId: source.id, relatedTableId: target.id, operation: 'split', metadata: { orderIds } });
    await transaction.commit();
    emitFloorEvent(req, source.branchId, 'floor:tables-split', { sourceTableId: source.id, targetTableId: target.id, orderIds });
    send(res, { sourceTableId: source.id, targetTableId: target.id, movedOrders: orders.length });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
});

exports.listReservations = handle(async (req, res) => {
  const where = { restaurantId: req.restaurant.id };
  if (req.query.branchId) { assertBranchScope(req, req.query.branchId); where.branchId = req.query.branchId; }
  else if (req.restaurantBranchIds) where.branchId = { [Op.in]: req.restaurantBranchIds };
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const term = `%${req.query.search.trim().slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`;
    where[Op.and] = [{ [Op.or]: [{ guestName: { [Op.like]: term } }, { guestPhone: { [Op.like]: term } }] }];
  }
  if (req.query.status === 'upcoming' || req.query.view === 'upcoming') {
    where.status = { [Op.in]: ['pending', 'confirmed', 'checked_in'] };
    where.startsAt = { [Op.gte]: new Date() };
  } else if (req.query.status && req.query.status !== 'all') {
    if (!['pending', 'confirmed', 'rejected', 'cancelled', 'checked_in', 'seated', 'completed', 'no_show'].includes(req.query.status)) throw fail(400, 'Invalid reservation status filter.');
    where.status = req.query.status;
  }
  const rows = await Reservation.findAll({ where, include: [{ model: Branch, as: 'branch', attributes: ['id', 'name', 'timeZone'] }, { model: RestaurantTable, as: 'table', attributes: ['id', 'tableNumber'] }], order: [['startsAt', 'ASC']], limit: 200 });
  send(res, rows);
});

exports.createReservation = handle(async (req, res) => {
  const { branchId, guestName, guestPhone, guestEmail, partySize, startsAt, durationMinutes = 120, notes } = req.body || {};
  assertBranchScope(req, branchId);
  if (typeof guestName !== 'string' || !guestName.trim() || guestName.trim().length > 150 || typeof guestPhone !== 'string' || !/^\+?[0-9][0-9\s().-]{6,19}$/.test(guestPhone.trim())) throw fail(400, 'Enter the guest name and a valid phone number.');
  if (!Number.isInteger(Number(partySize)) || Number(partySize) < 1 || Number(partySize) > 100) throw fail(400, 'Guest count must be between 1 and 100.');
  if (!Number.isInteger(Number(durationMinutes)) || Number(durationMinutes) < 30 || Number(durationMinutes) > 360) throw fail(400, 'Reservation duration must be from 30 to 360 minutes.');
  const transaction = await Reservation.sequelize.transaction();
  try {
    const branch = await Branch.findOne({ where: { id: branchId, restaurantId: req.restaurant.id, isActive: true, approvalStatus: 'approved', dineInEnabled: true }, transaction, lock: transaction.LOCK.UPDATE });
    if (!branch) throw fail(404, 'Branch is not available for reservations.');
    if (typeof branch.timeZone !== 'string' || !branch.timeZone.trim()) throw fail(409, 'This branch has no configured time zone. Update its operating information before taking reservations.');
    let start;
    try { start = localDateTimeToInstant(startsAt, branch.timeZone); } catch (error) { throw fail(400, error.message || 'Choose a valid local reservation date and time.'); }
    if (start <= new Date()) throw fail(400, 'Choose a future reservation date and time in the branch local time zone.');
    const end = new Date(start.getTime() + Number(durationMinutes) * 60000);
    if (!reservationFitsBranchHours(branch, start, end)) throw fail(409, 'The branch is not open for the full reservation duration at that local date and time.');
    const candidates = await RestaurantTable.findAll({ where: { restaurantId: req.restaurant.id, branchId, isActive: true, occupancyStatus: { [Op.in]: ['available', 'reserved'] }, seatingCapacity: { [Op.gte]: Number(partySize) } }, order: [['seatingCapacity', 'ASC'], ['tableNumber', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    let table = null;
    for (const candidate of candidates) {
      const conflict = await Reservation.findOne({ where: { tableId: candidate.id, status: { [Op.in]: busyStatuses }, startsAt: { [Op.lt]: end }, endsAt: { [Op.gt]: start } }, transaction, lock: transaction.LOCK.UPDATE });
      if (!conflict) { table = candidate; break; }
    }
    if (!table) throw fail(409, 'No suitable table is available for that time and party size.');
    const reservation = await Reservation.create({ restaurantId: req.restaurant.id, branchId, tableId: table.id, createdByMemberId: req.restaurantMembership.id, guestName: guestName.trim(), guestPhone: guestPhone.trim(), guestEmail: typeof guestEmail === 'string' ? guestEmail.trim().slice(0, 150) || null : null, partySize: Number(partySize), startsAt: start, endsAt: end, status: 'pending', notes: typeof notes === 'string' ? notes.trim().slice(0, 2000) || null : null }, { transaction });
    await createRestaurantNotification({ app: req.app, restaurantId: req.restaurant.id, branchId, category: 'reservations', title: 'New reservation request', message: `${reservation.guestName} requested a table for ${reservation.partySize}.`, href: `/restaurant/reservations?search=${encodeURIComponent(reservation.guestName)}`, entityId: reservation.id, dedupeKey: `reservation-created:${reservation.id}`, transaction });
    await transaction.commit();
    emitFloorEvent(req, branchId, 'floor:reservation-updated', { reservationId: reservation.id, status: reservation.status, tableId: table.id });
    send(res, reservation, 201);
  } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
});

exports.updateReservation = handle(async (req, res) => {
  const { status, tableId, rejectionReason } = req.body || {};
  const transaction = await Reservation.sequelize.transaction();
  try {
    const reservation = await Reservation.findOne({ where: { id: req.params.reservationId, restaurantId: req.restaurant.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!reservation) throw fail(404, 'Reservation not found.');
    assertBranchScope(req, reservation.branchId);
    if (!reservationTransitionAllowed(reservation.status, status)) throw fail(409, `Reservation cannot be changed from ${reservation.status} to ${status}.`);
    if (status === 'no_show' && new Date() < new Date(reservation.startsAt)) throw fail(409, 'A reservation cannot be marked no-show before its start time.');
    if (status === 'rejected' && rejectionReason != null && (typeof rejectionReason !== 'string' || rejectionReason.trim().length > 2000)) throw fail(400, 'Rejection reason must be 2,000 characters or fewer.');
    if (status !== 'rejected' && rejectionReason != null) throw fail(400, 'A rejection reason is only accepted when rejecting a reservation.');
    let table = null;
    if (status === 'confirmed') {
      if (new Date(reservation.startsAt) <= new Date()) throw fail(409, 'A reservation cannot be confirmed after its start time.');
      const branch = await Branch.findOne({ where: { id: reservation.branchId, restaurantId: req.restaurant.id, isActive: true, approvalStatus: 'approved', dineInEnabled: true, operationalStatus: { [Op.notIn]: ['inactive', 'temporarily_closed'] } }, transaction, lock: transaction.LOCK.UPDATE });
      if (!branch) throw fail(409, 'This branch is no longer accepting reservations.');
      if (!reservationFitsBranchHours(branch, new Date(reservation.startsAt), new Date(reservation.endsAt))) throw fail(409, 'The branch is not open for the full reservation duration at the selected local date and time.');
      const assignedTableId = tableId || reservation.tableId;
      if (!assignedTableId) throw fail(400, 'Choose an available table before confirming this request.');
      table = await RestaurantTable.findOne({ where: { id: assignedTableId, restaurantId: req.restaurant.id, branchId: reservation.branchId, isActive: true, occupancyStatus: { [Op.in]: ['available', 'reserved'] }, seatingCapacity: { [Op.gte]: reservation.partySize } }, transaction, lock: transaction.LOCK.UPDATE });
      if (!table) throw fail(409, 'The selected table is inactive, unavailable, or too small.');
      if (!table.isActive) throw fail(409, 'An inactive table cannot be reserved.');
      const conflict = await Reservation.findOne({ where: { id: { [Op.ne]: reservation.id }, tableId: table.id, status: { [Op.in]: busyStatuses }, startsAt: { [Op.lt]: reservation.endsAt }, endsAt: { [Op.gt]: reservation.startsAt } }, transaction, lock: transaction.LOCK.UPDATE });
      if (conflict) throw fail(409, 'Another reservation overlaps this time.');
      const openOrders = await Order.count({ where: { tableId: table.id, status: { [Op.in]: ACTIVE_ORDER_STATUSES }, paymentStatus: { [Op.ne]: 'failed' } }, transaction });
      if (openOrders) throw fail(409, 'An occupied table cannot be confirmed for a reservation.');
    } else if (reservation.tableId) {
      table = await RestaurantTable.findOne({ where: { id: reservation.tableId, restaurantId: req.restaurant.id, branchId: reservation.branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!table) throw fail(409, 'The assigned reservation table is no longer available.');
    }
    if (['checked_in', 'seated', 'completed', 'no_show'].includes(status) && !table) throw fail(409, 'Assign a table before changing this reservation status.');
    const stamps = status === 'checked_in' ? { checkedInAt: new Date() } : status === 'seated' ? { seatedAt: new Date() } : status === 'completed' ? { completedAt: new Date() } : {};
    await reservation.update({ status, ...(status === 'confirmed' ? { tableId: table.id } : {}), ...(status === 'rejected' ? { rejectionReason: rejectionReason?.trim() || null } : {}), ...stamps }, { transaction });
    if (reservation.customerId && ['confirmed', 'rejected', 'cancelled', 'completed', 'no_show'].includes(status)) {
      const labels = { confirmed: 'Reservation confirmed', rejected: 'Reservation declined', cancelled: 'Reservation cancelled', completed: 'Reservation completed', no_show: 'Reservation marked no-show' };
      await createCustomerNotification({ app: req.app, customerId: reservation.customerId, category: 'reservations', title: labels[status], message: `Your reservation ${reservation.id.slice(0, 8).toUpperCase()} is ${status.replaceAll('_', ' ')}.${status === 'rejected' && rejectionReason ? ` ${rejectionReason.trim()}` : ''}`, href: '/customer/reservations', entityId: reservation.id, dedupeKey: `reservation-status:${reservation.id}:${status}`, transaction });
    }
    await createRestaurantNotification({ app: req.app, restaurantId: reservation.restaurantId, branchId: reservation.branchId, category: 'reservations', title: 'Reservation updated', message: `Reservation ${reservation.guestName} is ${status.replaceAll('_', ' ')}.`, href: `/restaurant/reservations?search=${encodeURIComponent(reservation.guestName)}`, entityId: reservation.id, dedupeKey: `reservation-status:${reservation.id}:${status}`, transaction });
    if (table && status === 'seated') await table.update({ occupancyStatus: 'occupied' }, { transaction });
    else if (table && status === 'confirmed') await updateOccupancy(table, transaction, 'reserved');
    else if (table && status === 'checked_in') await updateOccupancy(table, transaction, 'reserved');
    else if (table && ['completed', 'no_show', 'cancelled', 'rejected'].includes(status)) await updateOccupancy(table, transaction, status === 'completed' ? 'cleaning' : 'available');
    await transaction.commit();
    emitFloorEvent(req, reservation.branchId, 'floor:reservation-updated', { reservationId: reservation.id, customerId: reservation.customerId, status, tableId: reservation.tableId });
    if (reservation.customerId) emitCustomerReservationEvent(req, reservation.customerId, { reservationId: reservation.id, status, rejectionReason: reservation.rejectionReason });
    send(res, reservation);
  } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
});

exports.availableReservationTables = handle(async (req, res) => {
  const reservation = await Reservation.findOne({ where: { id: req.params.reservationId, restaurantId: req.restaurant.id }, attributes: ['id', 'branchId', 'partySize', 'startsAt', 'endsAt', 'tableId'], raw: true });
  if (!reservation) throw fail(404, 'Reservation not found.');
  assertBranchScope(req, reservation.branchId);
  if (reservation.tableId || !(await Reservation.findOne({ where: { id: reservation.id, status: 'pending' }, attributes: ['id'] }))) throw fail(409, 'Table choices are only available for unassigned pending reservations.');
  const candidates = await RestaurantTable.findAll({
    where: { restaurantId: req.restaurant.id, branchId: reservation.branchId, isActive: true, seatingCapacity: { [Op.gte]: reservation.partySize }, occupancyStatus: { [Op.in]: ['available', 'reserved'] } },
    attributes: ['id', 'tableNumber', 'seatingCapacity'], order: [['seatingCapacity', 'ASC'], ['tableNumber', 'ASC']],
  });
  const available = [];
  for (const table of candidates) {
    const conflict = await Reservation.findOne({ where: { id: { [Op.ne]: reservation.id }, tableId: table.id, status: { [Op.in]: busyStatuses }, startsAt: { [Op.lt]: reservation.endsAt }, endsAt: { [Op.gt]: reservation.startsAt } }, attributes: ['id'] });
    const activeOrder = await Order.count({ where: { tableId: table.id, orderType: 'dine_in', status: { [Op.in]: ACTIVE_ORDER_STATUSES }, paymentStatus: { [Op.ne]: 'failed' } } });
    if (!conflict && !activeOrder) available.push(table);
  }
  send(res, available);
});

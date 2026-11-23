const { Op } = require('sequelize');
const { Reservation, Restaurant, Branch, RestaurantTable } = require('../../models');
const { localDateTimeToInstant, reservationFitsBranchHours } = require('../../services/branch-availability');
const { emitFloorEvent, emitCustomerReservationEvent, updateOccupancy } = require('../../services/table-operations');

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const send = (res, data, status = 200, message) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });
const pendingAndActive = ['pending', 'confirmed', 'checked_in', 'seated'];
const allowedDurations = [60, 90, 120, 150, 180, 240, 300, 360];

exports.listMine = wrap(async (req, res) => {
  const rows = await Reservation.findAll({
    where: { customerId: req.customer.id },
    include: [
      { model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'slug', 'logo'] },
      { model: Branch, as: 'branch', attributes: ['id', 'name', 'city', 'timeZone'] },
      { model: RestaurantTable, as: 'table', attributes: ['id', 'tableNumber'], required: false },
    ],
    order: [['startsAt', 'DESC']],
    limit: 200,
  });
  send(res, rows.map((row) => ({ ...row.toJSON(), reference: `FH-${row.id.slice(0, 8).toUpperCase()}`, durationMinutes: Math.round((new Date(row.endsAt) - new Date(row.startsAt)) / 60000) })));
});

exports.create = wrap(async (req, res) => {
  const { restaurantId, branchId, guestName, guestPhone, guestEmail, partySize, startsAt, durationMinutes = 120, notes } = req.body || {};
  if (typeof restaurantId !== 'string' || typeof branchId !== 'string') throw fail(400, 'Choose a restaurant and branch.');
  if (typeof guestName !== 'string' || !guestName.trim() || guestName.trim().length > 150) throw fail(400, 'Enter the guest name.');
  if (typeof guestPhone !== 'string' || !/^[6-9]\d{9}$/.test(guestPhone)) throw fail(400, 'Enter a 10-digit Indian mobile number starting with 6–9.');
  if (guestEmail != null && guestEmail !== '' && (typeof guestEmail !== 'string' || guestEmail.trim().length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()))) throw fail(400, 'Enter a valid email address.');
  if (!Number.isInteger(Number(partySize)) || Number(partySize) < 1 || Number(partySize) > 100) throw fail(400, 'Guest count must be between 1 and 100.');
  if (!allowedDurations.includes(Number(durationMinutes))) throw fail(400, 'Choose a supported reservation duration.');

  const transaction = await Reservation.sequelize.transaction();
  try {
    const restaurant = await Restaurant.findOne({ where: { id: restaurantId, approvalStatus: 'approved', listingStatus: 'published', marketplaceEnabled: true }, attributes: ['id'], transaction });
    if (!restaurant) throw fail(404, 'This restaurant is not available for online reservations.');
    const branch = await Branch.findOne({
      where: { id: branchId, restaurantId, isActive: true, approvalStatus: 'approved', dineInEnabled: true, operationalStatus: { [Op.notIn]: ['inactive', 'temporarily_closed'] } },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!branch) throw fail(404, 'This branch is not available for online reservations.');
    if (typeof branch.timeZone !== 'string' || !branch.timeZone.trim()) throw fail(409, 'This branch has no configured time zone.');
    let start;
    try { start = localDateTimeToInstant(startsAt, branch.timeZone); } catch (error) { throw fail(400, error.message || 'Choose a valid local reservation date and time.'); }
    if (start <= new Date()) throw fail(400, 'Choose a future date and time in the branch local time zone.');
    const end = new Date(start.getTime() + Number(durationMinutes) * 60000);
    if (!reservationFitsBranchHours(branch, start, end)) throw fail(409, 'The branch is not open for the full reservation duration at that local date and time.');

    // Requests remain unassigned and do not hold tables. Check that the request
    // could fit an active table now; final assignment happens under lock on confirm.
    const candidates = await RestaurantTable.findAll({
      where: { restaurantId, branchId, isActive: true, seatingCapacity: { [Op.gte]: Number(partySize) }, occupancyStatus: { [Op.in]: ['available', 'reserved'] } },
      attributes: ['id'],
      order: [['seatingCapacity', 'ASC'], ['tableNumber', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    let hasCandidate = false;
    for (const table of candidates) {
      const conflict = await Reservation.findOne({ where: { tableId: table.id, status: { [Op.in]: pendingAndActive }, startsAt: { [Op.lt]: end }, endsAt: { [Op.gt]: start } }, attributes: ['id'], transaction });
      if (!conflict) { hasCandidate = true; break; }
    }
    if (!hasCandidate) throw fail(409, 'No suitable table appears available for that time and party size.');

    const reservation = await Reservation.create({
      restaurantId, branchId, tableId: null, createdByMemberId: null, customerId: req.customer.id,
      guestName: guestName.trim(), guestPhone, guestEmail: typeof guestEmail === 'string' ? guestEmail.trim().slice(0, 150) || null : null,
      partySize: Number(partySize), startsAt: start, endsAt: end, status: 'pending', notes: typeof notes === 'string' ? notes.trim().slice(0, 2000) || null : null,
    }, { transaction });
    await transaction.commit();
    emitFloorEvent(req, branchId, 'floor:reservation-updated', { restaurantId, reservationId: reservation.id, customerId: req.customer.id, status: reservation.status, tableId: null });
    emitCustomerReservationEvent(req, req.customer.id, { reservationId: reservation.id, status: reservation.status });
    send(res, { ...reservation.toJSON(), reference: `FH-${reservation.id.slice(0, 8).toUpperCase()}`, durationMinutes: Number(durationMinutes) }, 201, 'Reservation request sent to the restaurant.');
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
});

exports.cancelMine = wrap(async (req, res) => {
  const transaction = await Reservation.sequelize.transaction();
  try {
    const reservation = await Reservation.findOne({ where: { id: req.params.reservationId, customerId: req.customer.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!reservation) throw fail(404, 'Reservation not found.');
    if (!['pending', 'confirmed'].includes(reservation.status)) throw fail(409, 'Only pending or confirmed reservations can be cancelled by the customer.');
    if (new Date(reservation.startsAt) <= new Date()) throw fail(409, 'A reservation cannot be cancelled after its start time.');
    const table = reservation.tableId ? await RestaurantTable.findOne({ where: { id: reservation.tableId, restaurantId: reservation.restaurantId, branchId: reservation.branchId }, transaction, lock: transaction.LOCK.UPDATE }) : null;
    await reservation.update({ status: 'cancelled' }, { transaction });
    if (table) await updateOccupancy(table, transaction);
    await transaction.commit();
    emitFloorEvent(req, reservation.branchId, 'floor:reservation-updated', { restaurantId: reservation.restaurantId, reservationId: reservation.id, customerId: req.customer.id, status: 'cancelled', tableId: reservation.tableId });
    emitCustomerReservationEvent(req, req.customer.id, { reservationId: reservation.id, status: 'cancelled' });
    send(res, reservation, 200, 'Reservation cancelled.');
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
});

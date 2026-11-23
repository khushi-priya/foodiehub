const { Op } = require("sequelize");
const { Order, Reservation, RestaurantTable } = require("../models");
const { tableOccupancy } = require("./floor-policy");

const ACTIVE_ORDER_STATUSES = ["pending", "accepted", "preparing", "ready"];
const ACTIVE_RESERVATION_STATUSES = ["confirmed", "checked_in"];

function emitFloorEvent(req, branchId, event, data) {
  const io = req.app?.get("io");
  if (!io) return;
  const restaurantId =
    req.restaurant?.id ||
    req.restaurantMembership?.restaurantId ||
    data.restaurantId;
  if (!restaurantId) return;
  const stream =
    event === "floor:order-updated"
      ? "orders"
      : event === "floor:reservation-updated"
        ? "reservations"
        : "tables";
  io.to(`floor:${restaurantId}:${branchId}:${stream}`).emit(event, {
    restaurantId,
    branchId,
    ...data,
  });
}

function emitCustomerReservationEvent(req, customerId, data) {
  const io = req.app?.get("io");
  if (io && customerId)
    io.to(`customer:${customerId}`).emit("customer:reservation-updated", data);
}

async function updateOccupancy(table, transaction, preferredStatus) {
  if (!table) return;
  if (!table.isActive) {
    await table.update({ occupancyStatus: "inactive" }, { transaction });
    return;
  }
  const [activeOrders, seatedReservation, futureReservation] =
    await Promise.all([
      Order.count({
        where: {
          tableId: table.id,
          status: { [Op.in]: ACTIVE_ORDER_STATUSES },
          paymentStatus: { [Op.ne]: "failed" },
        },
        transaction,
      }),
      Reservation.count({
        where: { tableId: table.id, status: "seated" },
        transaction,
      }),
      Reservation.count({
        where: {
          tableId: table.id,
          status: { [Op.in]: ACTIVE_RESERVATION_STATUSES },
          endsAt: { [Op.gt]: new Date() },
        },
        transaction,
      }),
    ]);
  const occupancyStatus = tableOccupancy({
    isActive: table.isActive,
    activeOrders,
    seatedReservations: seatedReservation,
    futureReservations: futureReservation,
    preferredStatus,
  });
  await table.update({ occupancyStatus }, { transaction });
}

async function occupyForOrder(tableId, transaction, { allowOccupied = false } = {}) {
  if (!tableId) return null;
  const table = await RestaurantTable.findOne({
    where: {
      id: tableId,
      isActive: true,
      occupancyStatus: allowOccupied ? { [Op.in]: ["available", "occupied"] } : "available",
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!table)
    throw Object.assign(
      new Error("This table is no longer available for dine-in ordering."),
      { status: 409 },
    );
  await table.update({ occupancyStatus: "occupied" }, { transaction });
  return table;
}

async function refreshAfterOrder(order, transaction) {
  if (!order?.tableId || order.orderType !== "dine_in") return null;
  const table = await RestaurantTable.findOne({
    where: { id: order.tableId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!table) return null;
  const preferred = order.status === "completed" ? "cleaning" : undefined;
  await updateOccupancy(table, transaction, preferred);
  return table;
}

module.exports = {
  ACTIVE_ORDER_STATUSES,
  ACTIVE_RESERVATION_STATUSES,
  emitFloorEvent,
  emitCustomerReservationEvent,
  updateOccupancy,
  occupyForOrder,
  refreshAfterOrder,
};

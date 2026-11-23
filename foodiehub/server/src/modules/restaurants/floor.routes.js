const express = require("express");
const router = express.Router();
const {
  requireRestaurantPermission,
} = require("../../middleware/requireRestaurantPermission");
const controller = require("./floor.controller");

router.get(
  "/tables",
  requireRestaurantPermission("tables.view"),
  controller.listTables,
);
router.get(
  "/waiters",
  requireRestaurantPermission("tables.manage"),
  controller.listWaiters,
);
router.get(
  "/branches",
  requireRestaurantPermission([
    "branches.view",
    "tables.view",
    "reservations.view",
    "reservations.manage",
  ]),
  controller.listBranches,
);
router.patch(
  "/tables/:tableId/waiter",
  requireRestaurantPermission("tables.manage"),
  controller.assignWaiter,
);
router.patch(
  "/tables/:tableId/occupancy",
  requireRestaurantPermission("tables.manage"),
  controller.setOccupancy,
);
router.post(
  "/orders/:orderId/transfer",
  requireRestaurantPermission("tables.manage"),
  controller.transferOrder,
);
router.post(
  "/tables/:tableId/merge",
  requireRestaurantPermission("tables.manage"),
  controller.mergeTable,
);
router.post(
  "/tables/:tableId/split",
  requireRestaurantPermission("tables.manage"),
  controller.splitTable,
);
router.get(
  "/reservations",
  requireRestaurantPermission(["reservations.view", "reservations.manage"]),
  controller.listReservations,
);
router.get(
  "/reservations/:reservationId/tables",
  requireRestaurantPermission(["reservations.view", "reservations.manage"]),
  controller.availableReservationTables,
);
router.post(
  "/reservations",
  requireRestaurantPermission(["reservations.create", "reservations.manage"]),
  controller.createReservation,
);
router.patch(
  "/reservations/:reservationId/status",
  requireRestaurantPermission(["reservations.update", "reservations.manage"]),
  controller.updateReservation,
);

module.exports = router;

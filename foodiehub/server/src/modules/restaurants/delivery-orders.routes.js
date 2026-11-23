const express = require("express");
const {
  requireRestaurantPermission,
} = require("../../middleware/requireRestaurantPermission");
const controller = require("./delivery-orders.controller");

const router = express.Router();
const canManageAssignments = requireRestaurantPermission([
  "delivery_assignments.create",
  "delivery_assignments.reassign",
]);

router.get(
  "/orders",
  requireRestaurantPermission("delivery_orders.view"),
  controller.listOrders,
);
router.get(
  "/orders/branches",
  requireRestaurantPermission(["delivery_orders.view", "delivery_assignments.view"]),
  controller.listBranches,
);
router.get(
  "/overview",
  requireRestaurantPermission("delivery_orders.view"),
  controller.overview,
);
router.get(
  "/assignments",
  requireRestaurantPermission("delivery_assignments.view"),
  controller.assignmentHistory,
);
router.get(
  "/live-locations",
  requireRestaurantPermission("delivery_tracking.view_branch"),
  controller.liveLocations,
);
router.get(
  "/settings",
  requireRestaurantPermission("delivery_orders.view"),
  controller.getSettings,
);
router.patch(
  "/settings",
  requireRestaurantPermission([
    "delivery_assignments.update",
    "delivery_assignments.create",
    "delivery_assignments.reassign",
  ]),
  controller.updateSettings,
);
router.get(
  "/reports",
  requireRestaurantPermission("delivery_reports.view"),
  controller.reports,
);
router.get(
  "/orders/:orderId",
  requireRestaurantPermission("delivery_orders.view"),
  controller.getOrder,
);
router.get(
  "/orders/:orderId/eligible-staff",
  canManageAssignments,
  controller.eligibleStaff,
);
router.post(
  "/orders/:orderId/assignments",
  canManageAssignments,
  controller.assignStaff,
);
router.post(
  "/orders/:orderId/auto-assign",
  canManageAssignments,
  controller.autoAssign,
);
router.post(
  "/assignments/:assignmentId/action",
  requireRestaurantPermission([
    "delivery_orders.accept",
    "delivery_orders.reject",
    "delivery_orders.update_status",
    "delivery_orders.complete",
  ]),
  controller.updateAssignment,
);

module.exports = router;

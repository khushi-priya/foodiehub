const express = require("express");
const {
  requireRestaurantPermission,
} = require("../../middleware/requireRestaurantPermission");
const controller = require("./delivery.controller");
const locationController = require("./delivery-location.controller");
const paymentController = require("./payments.controller");

const router = express.Router();
const requireDeliveryDashboardPermission = requireRestaurantPermission([
  "delivery_orders.view_assigned",
  "delivery_orders.view",
]);

router.get(
  "/dashboard",
  requireDeliveryDashboardPermission,
  controller.requireDeliveryMember,
  controller.getDashboard,
);
router.patch(
  "/me/availability",
  requireRestaurantPermission("delivery_staff.set_availability"),
  controller.requireDeliveryMember,
  controller.updateAvailability,
);
router.patch(
  "/me/location",
  requireRestaurantPermission("delivery_orders.view_assigned"),
  controller.requireDeliveryMember,
  locationController.updateLocation,
);
router.delete(
  "/me/location",
  requireRestaurantPermission("delivery_orders.view_assigned"),
  controller.requireDeliveryMember,
  locationController.stopLocation,
);
router.post(
  "/assignments/:assignmentId/cod-collection",
  requireRestaurantPermission("delivery_orders.view_assigned"),
  controller.requireDeliveryMember,
  paymentController.confirmCodCollection,
);
router.post(
  "/me/cash-handovers",
  requireRestaurantPermission("delivery_orders.view_assigned"),
  controller.requireDeliveryMember,
  paymentController.submitCashHandover,
);

module.exports = router;

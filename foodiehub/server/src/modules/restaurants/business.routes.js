const express = require("express");
const {
  requireRestaurantPermission,
} = require("../../middleware/requireRestaurantPermission");
const controller = require("./business.controller");
const router = express.Router();
router.get(
  "/",
  requireRestaurantPermission("business.view"),
  controller.getSettings,
);
router.patch(
  "/profile",
  requireRestaurantPermission("business.update"),
  controller.updateProfile,
);
router.patch(
  "/orders",
  requireRestaurantPermission("business.update"),
  controller.updateSettings,
);
router.patch(
  "/hours",
  requireRestaurantPermission("business.update"),
  controller.updateHours,
);
router.post(
  "/branches/:branchId/close",
  requireRestaurantPermission("business.update"),
  controller.closeBranch,
);
router.post(
  "/branches/:branchId/reopen",
  requireRestaurantPermission("business.update"),
  controller.reopenBranch,
);
module.exports = router;

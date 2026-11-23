const express = require("express");
const {
  requireRestaurantPermission,
} = require("../../middleware/requireRestaurantPermission");
const controller = require("./team.controller");
const router = express.Router();
const requireRestaurantOwner = (req, res, next) =>
  req.restaurantRole === "restaurant_owner"
    ? next()
    : res
        .status(403)
        .json({
          success: false,
          message: "Only a restaurant owner can manage delivery staff.",
        });

router.post("/accept-invitation", controller.acceptInvitation);
router.get(
  "/delivery/staff",
  requireRestaurantPermission("employees.view"),
  requireRestaurantOwner,
  controller.listDeliveryStaff,
);
router.get(
  "/delivery/roles",
  requireRestaurantPermission("employees.view"),
  requireRestaurantOwner,
  controller.listDeliveryRoles,
);
router.get(
  "/delivery/permissions",
  requireRestaurantPermission("employees.view"),
  requireRestaurantOwner,
  controller.listDeliveryPermissions,
);
router.post(
  "/delivery/roles",
  requireRestaurantPermission("employees.manage_roles"),
  requireRestaurantOwner,
  controller.createDeliveryRole,
);
router.patch(
  "/delivery/roles/:roleId",
  requireRestaurantPermission("employees.manage_roles"),
  requireRestaurantOwner,
  controller.updateDeliveryRole,
);
router.post(
  "/delivery/staff",
  requireRestaurantPermission([
    "employees.create",
    "employees.manage_roles",
    "employees.assign_branches",
  ]),
  requireRestaurantOwner,
  controller.createDeliveryStaff,
);
router.patch(
  "/delivery/staff/:memberId",
  requireRestaurantPermission([
    "employees.update",
    "employees.deactivate",
    "employees.assign_branches",
    "employees.manage_roles",
  ]),
  requireRestaurantOwner,
  controller.updateDeliveryStaff,
);
router.get(
  "/employees",
  requireRestaurantPermission("employees.view"),
  controller.listEmployees,
);
router.post(
  "/employees",
  requireRestaurantPermission([
    "employees.create",
    "employees.manage_roles",
    "employees.assign_branches",
  ]),
  controller.createEmployee,
);
router.patch(
  "/employees/:memberId",
  requireRestaurantPermission([
    "employees.update",
    "employees.deactivate",
    "employees.assign_branches",
    "employees.manage_roles",
  ]),
  controller.updateEmployee,
);
router.get(
  "/roles",
  requireRestaurantPermission("employees.view"),
  controller.listRoles,
);
router.get(
  "/permissions",
  requireRestaurantPermission("employees.view"),
  controller.listPermissions,
);
router.post(
  "/roles",
  requireRestaurantPermission("employees.manage_roles"),
  controller.createRole,
);
router.put(
  "/roles/:roleId",
  requireRestaurantPermission("employees.manage_roles"),
  controller.updateRole,
);
router.get(
  "/attendance/me",
  requireRestaurantPermission("attendance.check_in"),
  controller.attendanceStatus,
);
router.get(
  "/attendance/branches",
  requireRestaurantPermission(["attendance.view", "attendance.check_in"]),
  controller.attendanceBranches,
);
router.post(
  "/attendance/check-in",
  requireRestaurantPermission("attendance.check_in"),
  controller.checkIn,
);
router.post(
  "/attendance/check-out",
  requireRestaurantPermission("attendance.check_out"),
  controller.checkOut,
);
router.get(
  "/attendance",
  requireRestaurantPermission("attendance.view"),
  controller.attendanceList,
);
router.patch(
  "/attendance/:attendanceId",
  requireRestaurantPermission("attendance.manage"),
  controller.updateAttendance,
);
module.exports = router;

const express = require("express");
const router = express.Router();
const {
  requireRestaurantPermission,
} = require("../../middleware/requireRestaurantPermission");
const controller = require("./menu.controller");

router.get(
  "/summary",
  requireRestaurantPermission("menu.view"),
  controller.summary,
);
router.get(
  "/categories",
  requireRestaurantPermission("menu.view"),
  controller.listCategories,
);
router.get(
  "/category-requests",
  requireRestaurantPermission("menu.view"),
  controller.listCategoryRequests,
);
router.post(
  "/categories",
  requireRestaurantPermission(["menu.create", "menu.manage"]),
  controller.createCategory,
);
router.put(
  "/category-requests/:requestId",
  requireRestaurantPermission(["menu.create", "menu.manage"]),
  controller.resubmitCategoryRequest,
);
router.put(
  "/categories/:categoryId",
  requireRestaurantPermission(["menu.update", "menu.manage"]),
  controller.updateCategory,
);
router.patch(
  "/categories/:categoryId/status",
  requireRestaurantPermission(["menu.update", "menu.manage"]),
  controller.categoryStatus,
);
router.delete(
  "/categories/:categoryId",
  requireRestaurantPermission(["menu.delete", "menu.manage"]),
  controller.deleteCategory,
);
router.get(
  "/items",
  requireRestaurantPermission("menu.view"),
  controller.listItems,
);
router.get(
  "/items/:itemId",
  requireRestaurantPermission("menu.view"),
  controller.getItem,
);
router.post(
  "/items",
  requireRestaurantPermission(["menu.create", "menu.manage"]),
  controller.createItem,
);
router.put(
  "/items/:itemId",
  requireRestaurantPermission(["menu.update", "menu.manage"]),
  controller.updateItem,
);
router.delete(
  "/items/:itemId",
  requireRestaurantPermission(["menu.delete", "menu.manage"]),
  controller.deleteItem,
);
router.patch(
  "/items/:itemId/availability",
  requireRestaurantPermission(["menu.update", "menu.manage"]),
  controller.patchItem("isAvailable"),
);
router.patch(
  "/items/:itemId/featured",
  requireRestaurantPermission(["menu.update", "menu.manage"]),
  controller.patchItem("isFeatured"),
);
router.post(
  "/items/:itemId/options",
  requireRestaurantPermission(["menu.create", "menu.manage"]),
  controller.createOption,
);
router.put(
  "/items/:itemId/options/:optionId",
  requireRestaurantPermission(["menu.update", "menu.manage"]),
  controller.updateOption,
);
router.delete(
  "/items/:itemId/options/:optionId",
  requireRestaurantPermission(["menu.delete", "menu.manage"]),
  controller.deleteOption,
);
module.exports = router;

const express = require("express");
const {
  requireRestaurantPermission,
} = require("../../middleware/requireRestaurantPermission");
const controller = require("./coupon.controller");

const router = express.Router();
router.use((req, _res, next) => {
  const url = new URL(req.url, "http://localhost");
  url.searchParams.delete("restaurantId");
  req.url = `${url.pathname}${url.search}`;
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    req.body = { ...req.body };
    delete req.body.restaurantId;
  }
  next();
});
router.use(requireRestaurantPermission("coupons.manage"));
router.get("/", controller.list);
router.post("/", controller.create);
router.get("/:couponId/usage", controller.usage);
router.get("/:couponId", controller.details);
router.put("/:couponId", controller.update);
router.patch("/:couponId/status", controller.setStatus);
module.exports = router;

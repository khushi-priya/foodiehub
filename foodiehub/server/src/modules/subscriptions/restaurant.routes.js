const express = require("express");
const router = express.Router();
const {
  requireRestaurantOwner,
} = require("../restaurants/restaurant.middleware");
const controller = require("./restaurant.controller");

router.use(requireRestaurantOwner);
router.get("/plans", controller.plans);
router.get("/current", controller.current);
router.post("/checkout", controller.createCheckout);
router.post("/payments/verify", controller.verifyPayment);
router.post("/payments/failure", controller.recordPaymentFailure);

module.exports = router;

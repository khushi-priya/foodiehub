'use strict';
const express = require('express');
const { requireRestaurantPermission } = require('../../middleware/requireRestaurantPermission');
const controller = require('./pos.controller');

const router = express.Router();
router.get('/branches', requireRestaurantPermission('pos.access'), controller.getBranches);
router.get('/menu', requireRestaurantPermission('pos.access'), controller.getMenu);
router.get('/tables', requireRestaurantPermission('pos.access'), controller.getTables);
router.get('/orders', requireRestaurantPermission('pos.access'), controller.listOrders);
router.post('/orders', requireRestaurantPermission('pos.manage'), controller.createOrder);
router.get('/orders/:orderId', requireRestaurantPermission('pos.access'), controller.getOrder);
router.post('/orders/:orderId/tenders/cash', requireRestaurantPermission('pos.manage'), controller.takeCash);
router.post('/orders/:orderId/tenders/razorpay/order', requireRestaurantPermission('pos.manage'), controller.createRazorpayTender);
router.post('/tenders/:tenderId/razorpay/verify', requireRestaurantPermission('pos.manage'), controller.verifyRazorpayTender);
router.post('/tenders/:tenderId/razorpay/reconcile', requireRestaurantPermission('pos.manage'), controller.reconcileRazorpayTender);

module.exports = router;

const express = require('express');
const router = express.Router();
const { requireRestaurantPermission } = require('../../middleware/requireRestaurantPermission');
const controller = require('./order.controller');
const refundController = require('./refund.controller');
router.post('/:orderId/refund', requireRestaurantPermission('payments.refund'), refundController.create);
router.get('/:orderId/refund', requireRestaurantPermission('payments.refund'), refundController.get);
router.get('/stats', requireRestaurantPermission(['reports.view','orders.view']), controller.getOrderStats);
router.get('/', requireRestaurantPermission('orders.view'), controller.getOrders);
router.get('/:orderId', requireRestaurantPermission('orders.view'), controller.getOrderById);
router.patch('/:orderId/status', requireRestaurantPermission(['orders.manage','orders.manage_status','orders.kitchen','kitchen.update_status','orders.cancel']), controller.updateOrderStatus);
router.patch('/:orderId/kitchen-handover', requireRestaurantPermission(['orders.manage','orders.manage_status','delivery_assignments.update']), controller.confirmKitchenHandover);

module.exports = router;

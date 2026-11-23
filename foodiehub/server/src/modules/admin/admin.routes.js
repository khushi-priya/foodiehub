
const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../middleware/requireAuth');
const requireSuperAdmin = require('../../middleware/requireSuperAdmin');

const restaurantController = require('./restaurant.controller');
const branchController = require('../restaurants/branch.controller');
const dashboardController = require('./dashboard.controller');
const branchControllerAdmin = require('./branch.controller');
const foodCategoryController = require('./food-category.controller');
const foodItemController = require('./food-item.controller');
const customerController = require('./customer.controller');
const orderController = require('./order.controller');
const subscriptionController = require('./subscription.controller');
const couponController = require('./coupon.controller');
const commissionController = require('./commission.controller');
const reportsController = require('./reports.controller');
const systemController = require('./system.controller');
const supportRoutes = require('./support.routes');
const deliveryController = require('./delivery.controller');
const paymentsController = require('./payments.controller');

// All routes in this file require an authenticated Super Admin.
router.use(requireAuth, requireSuperAdmin);
router.use('/support', supportRoutes);

router.get('/dashboard', dashboardController.overview);
router.get('/branches', branchControllerAdmin.list);
router.patch('/branches/:id/approval', branchControllerAdmin.setApproval);
router.patch('/branches/:id/operational-status', branchControllerAdmin.setOperationalStatus);

// Platform food category library and restaurant category review.
router.get('/food-categories', foodCategoryController.listCategories);
router.post('/food-categories', foodCategoryController.createCategory);
router.get('/food-categories/:categoryId', foodCategoryController.categoryDetails);
router.put('/food-categories/:categoryId', foodCategoryController.updateCategory);
router.patch('/food-categories/:categoryId/status', foodCategoryController.setCategoryStatus);
router.get('/food-category-requests', foodCategoryController.listRequests);
router.get('/food-category-requests/:requestId', foodCategoryController.requestDetails);
router.post('/food-category-requests/:requestId/approve-global', foodCategoryController.approveRequest('global'));
router.post('/food-category-requests/:requestId/approve-restaurant', foodCategoryController.approveRequest('restaurant'));
router.post('/food-category-requests/:requestId/reject', foodCategoryController.rejectRequest);

// Platform-wide restaurant menu monitoring and moderation.
router.get('/food-items/filters', foodItemController.filters);
router.get('/food-items', foodItemController.list);
router.get('/food-items/:itemId', foodItemController.details);
router.patch('/food-items/:itemId/moderation', foodItemController.moderate);

// Customer accounts and their order/payment history.
router.get('/customers', customerController.list);
router.get('/customers/:customerId', customerController.details);
router.get('/customers/:customerId/orders', customerController.orders);
router.get('/customers/:customerId/payments', customerController.payments);
router.get('/customers/:customerId/refunds', customerController.refunds);
router.patch('/customers/:customerId/status', customerController.setStatus);

// Platform-wide order and payment monitoring.
router.get('/orders/filters', orderController.filters);
router.get('/orders', orderController.list);
router.get('/orders/:orderId', orderController.details);
router.get('/delivery/assignments', deliveryController.assignments);
router.get('/payments/overview', paymentsController.overview);
router.get('/payments/cod-collections', paymentsController.collections);
router.get('/payments/cash-handovers', paymentsController.handovers);

// Subscription plans and restaurant subscription/payment history.
router.get('/subscription-plans', subscriptionController.listPlans);
router.post('/subscription-plans', subscriptionController.createPlan);
router.put('/subscription-plans/:planId', subscriptionController.updatePlan);
router.patch('/subscription-plans/:planId/status', subscriptionController.setPlanStatus);
router.get('/subscriptions', subscriptionController.listSubscriptions);
router.get('/subscriptions/:subscriptionId', subscriptionController.subscriptionDetails);

// Platform food coupons and restaurant subscription coupons use separate tables and scopes.
router.get('/coupons', couponController.list);
router.post('/coupons', couponController.create);
router.get('/coupons/:couponId', couponController.details);
router.put('/coupons/:couponId', couponController.update);
router.patch('/coupons/:couponId/status', couponController.setStatus);

// Commission ledger, rule configuration, and externally executed payout records.
router.get('/commission-rules', commissionController.rules);
router.post('/commission-rules', commissionController.createRule);
router.put('/commission-rules/:ruleId', commissionController.updateRule);
router.patch('/commission-rules/:ruleId/status', commissionController.setRuleStatus);
router.get('/commissions', commissionController.records);
router.post('/commissions/reconcile', commissionController.reconcile);
router.get('/settlements', commissionController.settlements);
router.post('/settlements', commissionController.createSettlement);

// Date-filtered platform reporting and CSV exports.
router.get('/reports/overview', reportsController.overview);
router.get('/reports/:type/export.csv', reportsController.exportCsv);
router.get('/reports/:type', reportsController.report);

// Platform settings are whitelisted; audit logs are exposed as read-only records.
router.get('/system/settings', systemController.getSettings);
router.put('/system/settings', systemController.updateSettings);
router.get('/system/audit-logs', systemController.auditLogs);

// Restaurant management
router.get('/restaurants', restaurantController.getRestaurants);
router.post('/restaurants', restaurantController.createRestaurant);

router.get(
  '/restaurants/:id',
  restaurantController.getRestaurantById
);
router.get('/restaurants/:id/branches', branchController.adminList);

router.patch(
  '/restaurants/:id/approve',
  restaurantController.approveRestaurant
);

router.patch(
  '/restaurants/:id/reject',
  restaurantController.rejectRestaurant
);

router.patch(
  '/restaurants/:id/suspend',
  restaurantController.suspendRestaurant
);

router.patch(
  '/restaurants/:id/reactivate',
  restaurantController.reactivateRestaurant
);

router.patch(
  '/restaurants/:id/listing',
  restaurantController.setRestaurantListing
);

module.exports = router;

'use strict';
const express = require('express');
const { requireRestaurantPermission } = require('../../middleware/requireRestaurantPermission');
const controller = require('./payments.controller');
const router = express.Router();

router.get('/overview', requireRestaurantPermission('payments.view'), controller.overview);
router.get('/transactions', requireRestaurantPermission('payments.transactions.view'), controller.transactions);
router.get('/transactions/:orderId', requireRestaurantPermission('payments.transactions.view'), controller.transactionDetails);
router.get('/cod-collections', requireRestaurantPermission('payments.cod.view'), controller.codCollections);
router.post('/cod-collections/:collectionId/resolve', requireRestaurantPermission('payments.cash_reconcile'), controller.resolveCodCollection);
router.get('/cash-reconciliation', requireRestaurantPermission('payments.cash_reconcile'), controller.cashReconciliation);
router.post('/cash-handovers/:handoverId/confirm', requireRestaurantPermission('payments.cash_reconcile'), controller.confirmCashHandover);
router.get('/settlements', requireRestaurantPermission('payments.settlements.view'), controller.settlements);
router.get('/refunds', requireRestaurantPermission('payments.refunds.view'), controller.refunds);

module.exports = router;

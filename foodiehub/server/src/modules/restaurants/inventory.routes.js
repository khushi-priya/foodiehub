'use strict';

const express = require('express');
const { requireRestaurantPermission } = require('../../middleware/requireRestaurantPermission');
const controller = require('./inventory.controller');
const router = express.Router();

router.get('/summary', requireRestaurantPermission('inventory.view'), controller.summary);
router.get('/items', requireRestaurantPermission('inventory.view'), controller.listItems);
router.post('/items', requireRestaurantPermission('inventory.manage'), controller.createItem);
router.put('/items/:itemId', requireRestaurantPermission('inventory.manage'), controller.updateItem);
router.get('/movements', requireRestaurantPermission('inventory.view'), controller.movements);
router.get('/menu-items', requireRestaurantPermission('inventory.view'), controller.menuItems);
router.post('/movements', requireRestaurantPermission('inventory.manage'), controller.adjustStock);
router.get('/suppliers', requireRestaurantPermission('inventory.view'), controller.listSuppliers);
router.post('/suppliers', requireRestaurantPermission('inventory.manage'), controller.createSupplier);
router.put('/suppliers/:supplierId', requireRestaurantPermission('inventory.manage'), controller.updateSupplier);
router.get('/purchase-orders', requireRestaurantPermission('inventory.view'), controller.listPurchaseOrders);
router.post('/purchase-orders', requireRestaurantPermission('inventory.manage'), controller.createPurchaseOrder);
router.patch('/purchase-orders/:orderId', requireRestaurantPermission('inventory.manage'), controller.updatePurchaseOrder);
router.post('/purchase-orders/:orderId/receive', requireRestaurantPermission('inventory.manage'), controller.receivePurchaseOrder);
router.get('/recipes/:branchId/:menuItemId', requireRestaurantPermission('inventory.view'), controller.getRecipe);
router.put('/recipes/:branchId/:menuItemId', requireRestaurantPermission('inventory.manage'), controller.saveRecipe);
router.delete('/recipes/:branchId/:menuItemId', requireRestaurantPermission('inventory.manage'), controller.deleteRecipe);

module.exports = router;

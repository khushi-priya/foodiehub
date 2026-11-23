const express = require('express');
const router = express.Router();
const { requireRestaurantPermission } = require('../../middleware/requireRestaurantPermission');
const controller = require('./table.controller');

router.get('/', requireRestaurantPermission('tables.view'), controller.list);
router.post('/', requireRestaurantPermission('tables.manage'), controller.create);
router.post('/qr-sheet', requireRestaurantPermission('tables.manage'), controller.qrSheet);
router.get('/:tableId/qr', requireRestaurantPermission('tables.view'), controller.qr);
router.post('/:tableId/qr', requireRestaurantPermission('tables.manage'), controller.generateQr);
router.get('/:tableId', requireRestaurantPermission('tables.view'), controller.details);
router.put('/:tableId', requireRestaurantPermission('tables.manage'), controller.update);
router.patch('/:tableId/status', requireRestaurantPermission('tables.manage'), controller.status);

module.exports = router;

const express = require('express');
const router = express.Router();
const { requireRestaurantPermission } = require('../../middleware/requireRestaurantPermission');
const controller = require('./branch.controller');

router.get('/summary', requireRestaurantPermission('branches.view'), controller.summary);
router.get('/', requireRestaurantPermission('branches.view'), controller.list);
router.post('/', requireRestaurantPermission('branches.manage'), controller.create);
router.get('/:branchId', requireRestaurantPermission('branches.view'), controller.details);
router.put('/:branchId', requireRestaurantPermission('branches.manage'), controller.update);
router.patch('/:branchId/status', requireRestaurantPermission('branches.manage'), controller.status);
router.patch('/:branchId/delivery-availability', requireRestaurantPermission('branches.manage'), controller.deliveryAvailability);
router.patch('/:branchId/primary', requireRestaurantPermission('branches.manage'), controller.setPrimary);
module.exports = router;

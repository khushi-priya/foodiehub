const express = require('express');
const { requireRestaurantPermission } = require('../../middleware/requireRestaurantPermission');
const business = require('./business.controller');
const settings = require('./settings.controller');

const router = express.Router();
router.get('/', requireRestaurantPermission('business.view'), settings.getSettings);
router.patch('/profile', requireRestaurantPermission('business.update'), business.updateProfile);
router.patch('/orders', requireRestaurantPermission('business.update'), business.updateSettings);
router.post('/security/password', requireRestaurantPermission('business.update'), settings.changePassword);

module.exports = router;

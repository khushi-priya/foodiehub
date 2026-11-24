'use strict';

const express = require('express');
const { requireRestaurantPermission } = require('../../middleware/requireRestaurantPermission');
const controller = require('./tools.controller');

const router = express.Router();
const permissions = controller.notificationPermissions;
router.get('/search', requireRestaurantPermission(['orders.view', 'menu.view', 'reservations.view', 'reservations.manage', 'tables.view', 'branches.view']), controller.search);
router.get('/notifications', requireRestaurantPermission(permissions), controller.notifications);
router.patch('/notifications/:notificationId/read', requireRestaurantPermission(permissions), controller.markRead);
router.post('/notifications/read-all', requireRestaurantPermission(permissions), controller.markAllRead);

module.exports = router;

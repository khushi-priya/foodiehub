const express = require('express');
const { requireRestaurantPermission } = require('../../middleware/requireRestaurantPermission');
const controller = require('./restaurant.controller');

const router = express.Router();
router.get('/options', requireRestaurantPermission('support.view'), controller.ticketOptions);
router.get('/tickets', requireRestaurantPermission('support.view'), controller.listTickets);
router.post('/tickets', requireRestaurantPermission('support.create'), controller.createTicket);
router.get('/tickets/:ticketId', requireRestaurantPermission('support.view'), controller.ticketDetails);
router.post('/tickets/:ticketId/replies', requireRestaurantPermission('support.create'), controller.reply);
router.get('/attachments/:attachmentId', requireRestaurantPermission('support.view'), controller.downloadAttachment);

module.exports = router;

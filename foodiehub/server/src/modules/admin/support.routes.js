const express = require('express');
const controller = require('./support.controller');

const router = express.Router();
router.get('/tickets', controller.listTickets);
router.get('/agents', controller.agents);
router.get('/tickets/:ticketId', controller.ticketDetails);
router.post('/tickets/:ticketId/replies', controller.reply);
router.patch('/tickets/:ticketId', controller.updateTicket);
router.get('/attachments/:attachmentId', controller.downloadAttachment);

module.exports = router;

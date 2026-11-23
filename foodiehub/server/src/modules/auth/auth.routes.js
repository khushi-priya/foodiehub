
const express = require('express');

const router = express.Router();

const authController = require('./auth.controller');
const { requireAuth } = require('../../middleware/requireAuth');

// Public restaurant owner registration.
router.post(
  '/restaurant/register',
  authController.registerRestaurant
);
router.post('/customer/register', authController.registerCustomer);

// Authentication.
router.post('/login', authController.login);
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;

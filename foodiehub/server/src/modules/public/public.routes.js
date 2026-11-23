const express = require('express');
const router = express.Router();
const controller = require('./public.controller');

router.get('/restaurants', controller.listRestaurants);
router.get('/qr/:token', controller.resolveTableQr);
router.get('/restaurants/:slug/qr', controller.restaurantQr);
router.get('/restaurants/:slug/branches', controller.restaurantBranches);
router.get('/restaurants/:slug/branches/:branchId/tables', controller.restaurantBranchTables);
router.post('/restaurants/:slug/branches/:branchId/tables/:tableId/select', controller.selectRestaurantTable);
router.get('/restaurants/:slug/branches/:branchId/qr', controller.restaurantBranchQr);
router.get('/restaurants/:slug/menu', controller.restaurantMenu);
router.get('/restaurants/:slug', controller.restaurantDetails);
router.get('/menu-items/:id', controller.menuItemDetails);

module.exports = router;

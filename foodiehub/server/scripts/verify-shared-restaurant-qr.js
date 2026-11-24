'use strict';

const { Op } = require('sequelize');
const crypto = require('node:crypto');
const { Restaurant, Branch, RestaurantTable, User } = require('../src/models');
const publicController = require('../src/modules/public/public.controller');
const restaurantTableController = require('../src/modules/restaurants/table.controller');
const checkoutController = require('../src/modules/customer/checkout.controller');

const publicRestaurant = { approvalStatus: 'approved', listingStatus: 'published', marketplaceEnabled: true };
const publicBranch = { isActive: true, dineInEnabled: true, approvalStatus: 'approved', operationalStatus: { [Op.notIn]: ['inactive', 'temporarily_closed'] } };

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; resolve({ status: this.statusCode, body }); } };
    handler(req, res, (error) => resolve({ status: error?.status || 500, body: { message: error?.message || 'Unknown request error.' } }));
  });
}

(async () => {
  try {
    await Restaurant.sequelize.authenticate();
    const restaurants = await Restaurant.findAll({ where: { ...publicRestaurant, qrToken: { [Op.ne]: null } }, attributes: ['id', 'slug', 'qrToken'] });
    const distinctTokens = new Set(restaurants.map((restaurant) => restaurant.qrToken));
    if (distinctTokens.size !== restaurants.length) throw new Error('Restaurant QR identifiers are not unique.');

    let scans = 0;
    let legacyScans = 0;
    let selectedTables = 0;
    let tableQrEndpointsVerified = 0;
    let newTableSharedQrVerified = false;
    let rejectedCrossRestaurantSelection = false;
    let checkoutRejectedCrossRestaurantTable = false;
    let occupiedTableRejected = false;
    const valid = [];
    const restaurantQrPayloads = new Map();
    for (const restaurant of restaurants) {
      const result = await invoke(publicController.resolveTableQr, { params: { token: restaurant.qrToken } }).catch((error) => { throw new Error(`Restaurant scan failed: ${error.message}`); });
      if (result.status !== 200 || !result.body?.success || result.body.data.restaurant.id !== restaurant.id) throw new Error('A restaurant QR did not resolve to its own menu.');
      scans += 1;
      if (result.body.data.table !== undefined) throw new Error('A restaurant QR auto-assigned a table.');
      if (result.body.data.tableQrToken !== restaurant.qrToken) throw new Error('The scan response did not use the shared restaurant QR token.');
      for (const table of result.body.data.tables) valid.push({ restaurant, table });
    }

    const legacy = await RestaurantTable.findOne({ where: { qrToken: { [Op.ne]: null } }, attributes: ['qrToken', 'restaurantId'], include: [{ model: Restaurant, as: 'restaurant', where: publicRestaurant, attributes: ['id'], required: true }] });
    if (legacy) {
      const result = await invoke(publicController.resolveTableQr, { params: { token: legacy.qrToken } });
      if (result.status !== 200 || result.body.data.restaurant.id !== legacy.restaurantId || result.body.data.table !== undefined) throw new Error('A legacy table QR did not safely resolve to the restaurant menu and table picker.');
      legacyScans = 1;
    }

    for (const { restaurant, table } of valid) {
      const result = await invoke(publicController.selectRestaurantTable, { params: { slug: restaurant.slug, branchId: table.branchId, tableId: table.id } }).catch((error) => { throw new Error(`Available table selection failed: ${error.message}`); });
      if (result.status !== 200 || result.body.data.table.id !== table.id || result.body.data.tableQrToken !== restaurant.qrToken) throw new Error('Available table selection failed restaurant QR validation.');
      selectedTables += 1;
      const tableQr = await invoke(restaurantTableController.qr, { params: { tableId: table.id }, restaurant, restaurantBranchIds: null });
      if (!restaurantQrPayloads.has(restaurant.id)) {
        const qr = await invoke(publicController.restaurantQr, { params: { slug: restaurant.slug } });
        if (qr.status !== 200) throw new Error('Restaurant QR endpoint failed.');
        restaurantQrPayloads.set(restaurant.id, qr.body.data);
      }
      const expectedQr = restaurantQrPayloads.get(restaurant.id);
      if (tableQr.status !== 200 || tableQr.body.data.qrId !== restaurant.qrToken || tableQr.body.data.qrUrl !== expectedQr.qrUrl || tableQr.body.data.imageDataUrl !== expectedQr.imageDataUrl) throw new Error('A table QR endpoint did not return the exact shared restaurant QR image and URL.');
      tableQrEndpointsVerified += 1;
    }

    if (valid.length) {
      const { restaurant, table } = valid[0];
      const tableNumber = `QRV-${crypto.randomBytes(6).toString('hex')}`;
      try {
        const created = await invoke(restaurantTableController.create, {
          restaurant: { id: restaurant.id }, restaurantBranchIds: null,
          body: { tableNumber, seatingCapacity: 2, branchId: table.branchId },
        });
        if (created.status !== 201 || created.body.data.qrAvailable !== true) throw new Error('New table did not inherit shared restaurant QR availability.');
        const qr = await invoke(restaurantTableController.qr, { params: { tableId: created.body.data.id }, restaurant: { id: restaurant.id }, restaurantBranchIds: null });
        const expectedQr = restaurantQrPayloads.get(restaurant.id);
        newTableSharedQrVerified = qr.status === 200 && qr.body.data.qrUrl === expectedQr.qrUrl && qr.body.data.imageDataUrl === expectedQr.imageDataUrl;
        if (!newTableSharedQrVerified) throw new Error('New table did not return the exact existing restaurant QR.');
      } finally {
        await RestaurantTable.destroy({ where: { restaurantId: restaurant.id, branchId: table.branchId, tableNumber } });
      }
    }

    if (valid.length) {
      const { restaurant, table } = valid[0];
      const tableNumber = `QRO-${crypto.randomBytes(6).toString('hex')}`;
      let occupiedId;
      try {
        const occupied = await RestaurantTable.create({
          restaurantId: restaurant.id, branchId: table.branchId, tableNumber,
          seatingCapacity: 2, isActive: true, occupancyStatus: 'occupied', qrToken: null,
        });
        occupiedId = occupied.id;
        const selection = await invoke(publicController.selectRestaurantTable, { params: { slug: restaurant.slug, branchId: table.branchId, tableId: occupied.id } });
        occupiedTableRejected = selection.status === 404;
        if (!occupiedTableRejected) throw new Error('An occupied table was selectable.');
      } finally {
        if (occupiedId) await RestaurantTable.destroy({ where: { id: occupiedId, restaurantId: restaurant.id } });
      }
    }
    if (valid.length > 1 && valid[0].restaurant.id !== valid[1].restaurant.id) {
      const { restaurant, table } = valid[0];
      const otherTable = valid.find((entry) => entry.restaurant.id !== restaurant.id).table;
      const result = await invoke(publicController.selectRestaurantTable, { params: { slug: restaurant.slug, branchId: otherTable.branchId, tableId: otherTable.id } });
      rejectedCrossRestaurantSelection = result.status === 404;
      if (!rejectedCrossRestaurantSelection) throw new Error('Cross-restaurant table selection was accepted.');
      const customer = await User.findOne({ attributes: ['id'] });
      if (customer) {
        const checkout = await invoke(checkoutController.addItem, {
          customer: { id: customer.id },
          body: { tableQrToken: restaurant.qrToken, tableId: otherTable.id, branchId: otherTable.branchId, menuItemId: 'invalid-unreached-menu-item' },
        });
        checkoutRejectedCrossRestaurantTable = checkout.status === 409;
        if (!checkoutRejectedCrossRestaurantTable) throw new Error('Checkout accepted another restaurant\'s table.');
      }
    }

    const grouped = await RestaurantTable.findAll({
      attributes: ['restaurantId'],
      include: [{ model: Restaurant, as: 'restaurant', attributes: ['qrToken'], required: true }],
      raw: true,
    });
    const tableRestaurantCount = new Set(grouped.map((row) => row.restaurantId)).size;
    console.log(JSON.stringify({
      success: true,
      publicRestaurants: restaurants.length,
      distinctPublicRestaurantQrs: distinctTokens.size,
      scansPassed: scans,
      legacyScansPassed: legacyScans,
      availableTableSelectionsPassed: selectedTables,
      tableQrEndpointsVerified,
      newTableSharedQrVerified,
      crossRestaurantSelectionRejected: rejectedCrossRestaurantSelection,
      checkoutRejectedCrossRestaurantTable: checkoutRejectedCrossRestaurantTable || null,
      occupiedTableRejected: occupiedTableRejected || null,
      tableOwningRestaurants: tableRestaurantCount,
    }));
  } catch (error) {
    console.error(JSON.stringify({ success: false, error: error.name, message: error.message }));
    process.exitCode = 1;
  } finally {
    await Restaurant.sequelize.close();
  }
})();

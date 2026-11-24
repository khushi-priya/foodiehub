'use strict';

const crypto = require('node:crypto');
const QRCode = require('qrcode');
const { Restaurant } = require('../models');
const { getPublicAppUrl } = require('./public-app-url');

function restaurantQrPath(token) {
  return `/qr/${encodeURIComponent(token)}`;
}

async function ensureRestaurantQr(restaurantId) {
  const transaction = await Restaurant.sequelize.transaction();
  try {
    const restaurant = await Restaurant.findByPk(restaurantId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!restaurant) throw Object.assign(new Error('Restaurant not found.'), { status: 404 });

    const qrToken = restaurant.qrToken || crypto.randomBytes(32).toString('base64url');
    const qrUrl = restaurantQrPath(qrToken);
    if (restaurant.qrToken !== qrToken || restaurant.qrUrl !== qrUrl) {
      await restaurant.update({ qrToken, qrUrl }, { transaction });
    }
    await transaction.commit();
    return { restaurant, qrToken, qrUrl };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function buildRestaurantQrPayload(restaurantOrId) {
  const id = typeof restaurantOrId === 'string' ? restaurantOrId : restaurantOrId?.id;
  if (!id) throw Object.assign(new Error('Restaurant not found.'), { status: 404 });
  const { restaurant, qrToken, qrUrl: storedQrUrl } = await ensureRestaurantQr(id);
  const qrUrl = new URL(storedQrUrl, `${getPublicAppUrl()}/`).toString();
  const imageDataUrl = await QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: 480,
  });
  const safeName = String(restaurant.slug || restaurant.id)
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-|-$/g, '') || 'restaurant';
  return {
    restaurantName: restaurant.name,
    qrId: qrToken,
    qrUrl,
    imageDataUrl,
    downloadName: `foodiehub-${safeName}-restaurant-qr.png`,
  };
}

module.exports = { ensureRestaurantQr, buildRestaurantQrPayload, restaurantQrPath };

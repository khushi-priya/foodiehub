'use strict';

const { CustomerNotification, CustomerNotificationPreference } = require('../models');

const preferenceField = {
  orders: 'orderUpdates',
  payments: 'paymentUpdates',
  reservations: 'reservationUpdates',
  delivery: 'deliveryUpdates',
  support: 'supportUpdates',
  marketing: 'marketingUpdates',
};

function publish(app, notification, io) {
  const room = (app?.get?.('io') || io)?.to(`customer:${notification.customerId}`);
  room?.emit('customer:notification', notification);
  if (notification.category === 'support') room?.emit('customer:support-updated', { ticketId: notification.entityId, reference: notification.message.match(/FHC-[A-Z0-9-]+/)?.[0] || null, status: null });
}

async function createCustomerNotification({ app, io, customerId, category, title, message, href = null, entityId = null, dedupeKey = null, transaction = null }) {
  const preferenceName = preferenceField[category];
  if (!preferenceName || !customerId || typeof title !== 'string' || typeof message !== 'string') return null;
  const preferences = await CustomerNotificationPreference.findByPk(customerId, { transaction });
  const defaultEnabled = category !== 'marketing';
  if ((preferences ? preferences[preferenceName] : defaultEnabled) !== true) return null;
  const safeHref = typeof href === 'string' && href.startsWith('/customer/') ? href.slice(0, 255) : null;
  let notification;
  let created = true;
  if (dedupeKey) {
    const [row, wasCreated] = await CustomerNotification.findOrCreate({
      where: { customerId, dedupeKey: String(dedupeKey).slice(0, 150) },
      defaults: { customerId, category, title: title.slice(0, 120), message: message.slice(0, 500), href: safeHref, entityId: entityId == null ? null : String(entityId).slice(0, 80) },
      ...(transaction ? { transaction } : {}),
    });
    notification = row;
    created = wasCreated;
  } else {
    notification = await CustomerNotification.create({ customerId, category, title: title.slice(0, 120), message: message.slice(0, 500), href: safeHref, entityId: entityId == null ? null : String(entityId).slice(0, 80) }, transaction ? { transaction } : {});
  }
  if (created) {
    const data = notification.toJSON();
    if (transaction?.afterCommit) transaction.afterCommit(() => publish(app, data, io));
    else publish(app, data, io);
  }
  return notification;
}

module.exports = { createCustomerNotification, preferenceField };

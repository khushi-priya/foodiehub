const crypto = require('node:crypto');

function publishSuperAdminNotification(app, event) {
  const io = app?.get?.('io');
  if (!io) return null;
  const payload = {
    id: crypto.randomUUID(),
    type: String(event.type || 'platform_event').slice(0, 80),
    title: String(event.title || 'FoodieHub update').slice(0, 120),
    message: String(event.message || '').slice(0, 500),
    href: typeof event.href === 'string' && event.href.startsWith('/admin/') ? event.href : '/admin/system',
    entityId: event.entityId == null ? null : String(event.entityId).slice(0, 80),
    createdAt: new Date().toISOString(),
  };
  io.to('super_admin').emit('admin:notification', payload);
  return payload;
}

function notifySuperAdmins(req, event) {
  return publishSuperAdminNotification(req?.app, event);
}

module.exports = { notifySuperAdmins, publishSuperAdminNotification };

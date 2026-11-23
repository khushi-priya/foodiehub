const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../src/modules/support/restaurant.controller');
const { SupportTicket, SupportAttachment, User, RestaurantMember } = require('../src/models');
const { CATEGORIES, STATUSES, validateAttachments, notifyRestaurant } = require('../src/modules/support/support.shared');
const { requireRestaurantPermission } = require('../src/middleware/requireRestaurantPermission');

const validTicket = (overrides = {}) => ({ subject: 'Cannot update menu item', category: 'Menu & Food Items', description: 'The item editor fails after I save the updated description.', priority: 'normal', ...overrides });

test('support ticket validation uses the supported categories, priorities and description limits', () => {
  assert.equal(controller.validateTicketInput(validTicket()), undefined);
  assert.equal(CATEGORIES.length, 12);
  assert.deepEqual(STATUSES, ['open', 'in_progress', 'waiting_for_restaurant', 'resolved', 'closed']);
  for (const input of [validTicket({ subject: 'bad' }), validTicket({ category: 'Invented category' }), validTicket({ description: 'short' }), validTicket({ priority: 'critical' })]) {
    assert.throws(() => controller.validateTicketInput(input), { status: 400 });
  }
});

test('support attachments enforce supported content types, size limits and safe filenames', () => {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const [attachment] = validateAttachments([{ fileName: '../../screenshot.png', contentType: 'image/png', dataUrl: `data:image/png;base64,${pngSignature.toString('base64')}` }]);
  assert.equal(attachment.fileName, 'screenshot.png');
  assert.equal(attachment.contentType, 'image/png');
  assert.equal(attachment.sizeBytes, 8);
  assert.throws(() => validateAttachments([{ fileName: 'payload.svg', contentType: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }]), { status: 400 });
  const tooLarge = Buffer.alloc(700 * 1024 + 1, 1).toString('base64');
  assert.throws(() => validateAttachments([{ fileName: 'large.txt', contentType: 'text/plain', dataUrl: `data:text/plain;base64,${tooLarge}` }]), { status: 400 });
});

test('restaurant ticket detail lookup is constrained to the authenticated restaurant', async (t) => {
  const original = SupportTicket.findOne;
  let lookup;
  SupportTicket.findOne = async (options) => { lookup = options; return null; };
  t.after(() => { SupportTicket.findOne = original; });
  let nextError;
  await controller.ticketDetails({ params: { ticketId: 'ticket-from-another-restaurant' }, restaurant: { id: 'restaurant-a' } }, { json() { throw new Error('Cross-restaurant ticket should not be returned.'); } }, (error) => { nextError = error; });
  assert.equal(lookup.where.id, 'ticket-from-another-restaurant');
  assert.equal(lookup.where.restaurantId, 'restaurant-a');
  assert.equal(nextError.status, 404);
});

test('restaurant attachment download is constrained to the authenticated restaurant ticket', async (t) => {
  const original = SupportAttachment.findOne;
  let lookup;
  SupportAttachment.findOne = async (options) => { lookup = options; return null; };
  t.after(() => { SupportAttachment.findOne = original; });
  let nextError;
  await require('../src/modules/support/restaurant.controller').downloadAttachment({ params: { attachmentId: 'attachment-id' }, restaurant: { id: 'restaurant-a' } }, { set() {}, send() {} }, (error) => { nextError = error; });
  assert.equal(lookup.include[0].where.restaurantId, 'restaurant-a');
  assert.equal(nextError.status, 404);
});

test('restaurant members without the requested support permission are denied by the shared middleware', async (t) => {
  const originalUserLookup = User.findByPk;
  const originalMembershipLookup = RestaurantMember.findAll;
  User.findByPk = async () => ({ id: 'user-a', status: 'active' });
  RestaurantMember.findAll = async () => [];
  t.after(() => { User.findByPk = originalUserLookup; RestaurantMember.findAll = originalMembershipLookup; });
  const middleware = requireRestaurantPermission('support.view');
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await middleware({ session: { userId: 'user-a' }, params: {}, query: {}, body: {} }, res, (error) => { throw error; });
  assert.equal(res.statusCode, 403);
});

test('restaurant support notifications are emitted only to the tenant room', () => {
  let room; let eventName; let event;
  const req = { app: { get() { return { to(value) { room = value; return { emit(name, payload) { eventName = name; event = payload; } }; } }; } } };
  notifyRestaurant(req, 'restaurant-a', { ticketId: 'ticket-a', reference: 'FHT-123', title: 'Support replied', message: 'New reply.' });
  assert.equal(room, 'restaurant-support:restaurant-a');
  assert.equal(eventName, 'restaurant:support-updated');
  assert.equal(event.ticketId, 'ticket-a');
});

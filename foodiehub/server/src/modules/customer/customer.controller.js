const { Op } = require('sequelize');
const { marketplaceBranchWhere } = require('../../services/marketplace-branch-policy');
const { User, Order, OrderItem, CustomerAddress, CustomerWishlistItem, Restaurant, Branch, RestaurantTable, MenuItem, MenuCategory } = require('../../models');
const mapGeocoder = require('../../services/map-geocoder');
const { changePassword } = require('../../services/password-change');

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ success: false, message: 'That information is already in use or this item is already saved.' });
    next(error);
  }
};
const send = (res, data, status = 200, message) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });
const clean = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const phoneValid = (value) => /^\+?[0-9][0-9\s().-]{6,19}$/.test(value);
const PUBLIC_RESTAURANT = { approvalStatus: 'approved', listingStatus: 'published', marketplaceEnabled: true };
const PUBLIC_BRANCH = marketplaceBranchWhere();

exports.summary = wrap(async (req, res) => {
  const customerId = req.customer.id;
  const [totalOrders, activeOrders, completedOrders, wishlistItems] = await Promise.all([
    Order.count({ where: { customerId } }),
    Order.count({ where: { customerId, status: { [Op.in]: ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery'] } } }),
    Order.count({ where: { customerId, status: 'completed' } }),
    CustomerWishlistItem.count({ where: { customerId } }),
  ]);
  send(res, { totalOrders, activeOrders, completedOrders, wishlistItems });
});

exports.profile = wrap(async (req, res) => send(res, { id: req.customer.id, firstName: req.customer.firstName, lastName: req.customer.lastName, email: req.customer.email, phone: req.customer.phone }));

exports.searchMapAddress = wrap(async (req, res) => send(res, await mapGeocoder.search(req.query.q)));
exports.reverseMapAddress = wrap(async (req, res) => send(res, await mapGeocoder.reverse(req.query.latitude, req.query.longitude)));

exports.updateProfile = wrap(async (req, res) => {
  const { firstName, lastName = '', phone = '' } = req.body || {};
  if (!clean(firstName, 100)) throw fail(400, 'First name is required (maximum 100 characters).');
  if (typeof lastName !== 'string' || lastName.length > 100) throw fail(400, 'Last name must be 100 characters or fewer.');
  if (phone !== '' && (typeof phone !== 'string' || !phoneValid(phone.trim()))) throw fail(400, 'Enter a valid mobile number.');
  await req.customer.update({ firstName: firstName.trim(), lastName: lastName.trim() || null, phone: phone.trim() || null });
  send(res, { id: req.customer.id, firstName: req.customer.firstName, lastName: req.customer.lastName, email: req.customer.email, phone: req.customer.phone }, 200, 'Profile updated.');
});

exports.changePassword = wrap(async (req, res) => {
  const user = await User.findByPk(req.customer.id);
  await changePassword(user, req.body);
  send(res, { updated: true }, 200, 'Password changed.');
});

exports.orders = wrap(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 50);
  const where = { customerId: req.customer.id };
  if (req.query.status) {
    const statuses = ['pending', 'accepted', 'rejected', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
    if (!statuses.includes(req.query.status)) throw fail(400, 'Invalid order status.');
    where.status = req.query.status;
  }
  const result = await Order.findAndCountAll({ where, attributes: ['id', 'restaurantId', 'branchId', 'orderNumber', 'orderType', 'status', 'kitchenStatus', 'paymentStatus', 'paymentMethod', 'subtotal', 'tax', 'packagingFee', 'deliveryFee', 'discount', 'total', 'createdAt', 'acceptedAt', 'completedAt', 'cancelledAt'], include: [{ model: Restaurant, as: 'restaurant', attributes: ['name', 'slug', 'logo'] }, { model: Branch, as: 'branch', attributes: ['name', 'city'], required: false }, { model: RestaurantTable, as: 'table', attributes: ['tableNumber'], required: false }, { model: OrderItem, as: 'items', attributes: ['id', 'itemName', 'variantName', 'addonsSnapshot', 'quantity', 'unitPrice', 'lineTotal'] }], order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit });
  send(res, { orders: result.rows, pagination: { total: result.count, page, limit, totalPages: Math.ceil(result.count / limit) } });
});

function validateAddress(body) {
  const fields = { fullName: 150, phone: 20, house: 150, street: 255, city: 100, state: 100, postalCode: 20 };
  for (const [key, max] of Object.entries(fields)) if (!clean(body[key], max)) throw fail(400, `${key} is required (maximum ${max} characters).`);
  if (!phoneValid(body.phone.trim())) throw fail(400, 'Enter a valid mobile number.');
  if (body.landmark != null && (typeof body.landmark !== 'string' || body.landmark.length > 150)) throw fail(400, 'Landmark must be 150 characters or fewer.');
  if (body.addressType !== undefined && !['home', 'work', 'other'].includes(body.addressType)) throw fail(400, 'Address type must be home, work, or other.');
  if (body.isDefault !== undefined && typeof body.isDefault !== 'boolean') throw fail(400, 'isDefault must be true or false.');
  const hasLatitude = body.latitude !== '' && body.latitude != null;
  const hasLongitude = body.longitude !== '' && body.longitude != null;
  if (hasLatitude !== hasLongitude) throw fail(400, 'Provide both map coordinates, or leave both blank.');
  if (hasLatitude && (!Number.isFinite(Number(body.latitude)) || Number(body.latitude) < -90 || Number(body.latitude) > 90 || !Number.isFinite(Number(body.longitude)) || Number(body.longitude) < -180 || Number(body.longitude) > 180)) throw fail(400, 'Map coordinates are outside valid latitude or longitude ranges.');
}
function addressValues(body) {
  return { fullName: body.fullName.trim(), phone: body.phone.trim(), house: body.house.trim(), street: body.street.trim(), landmark: body.landmark?.trim() || null, city: body.city.trim(), state: body.state.trim(), postalCode: body.postalCode.trim(), latitude: body.latitude === '' || body.latitude == null ? null : Number(body.latitude), longitude: body.longitude === '' || body.longitude == null ? null : Number(body.longitude), addressType: body.addressType || 'home', isDefault: body.isDefault === true };
}
exports.addresses = wrap(async (req, res) => {
  const rows = await CustomerAddress.findAll({ where: { customerId: req.customer.id }, order: [['isDefault', 'DESC'], ['createdAt', 'DESC']] });
  send(res, rows);
});
exports.createAddress = wrap(async (req, res) => {
  validateAddress(req.body || {});
  const address = await CustomerAddress.sequelize.transaction(async (transaction) => {
    await User.findByPk(req.customer.id, { transaction, lock: transaction.LOCK.UPDATE });
    const count = await CustomerAddress.count({ where: { customerId: req.customer.id }, transaction });
    const values = addressValues(req.body);
    if (values.isDefault || count === 0) await CustomerAddress.update({ isDefault: false }, { where: { customerId: req.customer.id }, transaction });
    return CustomerAddress.create({ customerId: req.customer.id, ...values, isDefault: values.isDefault || count === 0 }, { transaction });
  });
  send(res, address, 201, 'Address saved.');
});
exports.updateAddress = wrap(async (req, res) => {
  validateAddress(req.body || {});
  const address = await CustomerAddress.sequelize.transaction(async (transaction) => {
    await User.findByPk(req.customer.id, { transaction, lock: transaction.LOCK.UPDATE });
    const current = await CustomerAddress.findOne({ where: { id: req.params.addressId, customerId: req.customer.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw fail(404, 'Address not found.');
    const values = addressValues(req.body);
    if (values.isDefault) await CustomerAddress.update({ isDefault: false }, { where: { customerId: req.customer.id }, transaction });
    await current.update(values, { transaction });
    return current;
  });
  send(res, address, 200, 'Address updated.');
});
exports.deleteAddress = wrap(async (req, res) => {
  const id = await CustomerAddress.sequelize.transaction(async (transaction) => {
    await User.findByPk(req.customer.id, { transaction, lock: transaction.LOCK.UPDATE });
    const address = await CustomerAddress.findOne({ where: { id: req.params.addressId, customerId: req.customer.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!address) throw fail(404, 'Address not found.');
    await address.destroy({ transaction });
    if (address.isDefault) {
      const next = await CustomerAddress.findOne({ where: { customerId: req.customer.id }, order: [['createdAt', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
      if (next) await next.update({ isDefault: true }, { transaction });
    }
    return address.id;
  });
  send(res, { id }, 200, 'Address removed.');
});

async function listedRestaurant(restaurantId) {
  const restaurant = await Restaurant.findOne({ where: { id: restaurantId, ...PUBLIC_RESTAURANT }, attributes: ['id', 'name', 'slug', 'logo'] });
  if (!restaurant) return null;
  const branchCount = await Branch.count({ where: { restaurantId, ...PUBLIC_BRANCH } });
  return branchCount ? restaurant : null;
}
async function foodWishlistData(menuItemId) {
  const item = await MenuItem.findOne({ where: { id: menuItemId, isAvailable: true }, include: [{ model: MenuCategory, as: 'category', where: { isActive: true }, required: true, attributes: ['id', 'name'] }] });
  if (!item) return null;
  const restaurant = await listedRestaurant(item.restaurantId);
  return restaurant ? { item, restaurant } : null;
}
exports.wishlist = wrap(async (req, res) => {
  const rows = await CustomerWishlistItem.findAll({ where: { customerId: req.customer.id }, include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'slug', 'logo'] }, { model: MenuItem, as: 'menuItem', attributes: ['id', 'name', 'price', 'discountedPrice', 'imageUrl', 'isAvailable'], include: [{ model: MenuCategory, as: 'category', attributes: ['id', 'name'] }] }], order: [['createdAt', 'DESC']] });
  const items = [];
  for (const row of rows) {
    if (row.targetType === 'restaurant' && row.restaurant) {
      const current = await listedRestaurant(row.restaurantId);
      items.push({ id: row.id, type: 'restaurant', restaurantId: row.restaurantId, name: row.restaurant.name, slug: row.restaurant.slug, image: row.restaurant.logo, isAvailable: Boolean(current), createdAt: row.createdAt });
    } else if (row.targetType === 'food' && row.menuItem) {
      const current = await foodWishlistData(row.menuItemId);
      items.push({ id: row.id, type: 'food', menuItemId: row.menuItemId, name: row.menuItem.name, image: row.menuItem.imageUrl, price: row.menuItem.discountedPrice ?? row.menuItem.price, restaurantName: current?.restaurant.name || null, slug: current?.restaurant.slug || null, category: row.menuItem.category?.name || null, isAvailable: Boolean(current), createdAt: row.createdAt });
    }
  }
  send(res, items);
});
exports.addWishlist = wrap(async (req, res) => {
  const { type, restaurantId, menuItemId } = req.body || {};
  if (type === 'restaurant') {
    if (typeof restaurantId !== 'string' || menuItemId) throw fail(400, 'Provide a restaurant to save.');
    if (!await listedRestaurant(restaurantId)) throw fail(404, 'Restaurant is not available.');
    const existing = await CustomerWishlistItem.findOne({ where: { customerId: req.customer.id, restaurantId } });
    if (existing) return send(res, existing, 200, 'Restaurant is already in your wishlist.');
    return send(res, await CustomerWishlistItem.create({ customerId: req.customer.id, targetType: 'restaurant', restaurantId }), 201, 'Restaurant saved.');
  }
  if (type === 'food') {
    if (typeof menuItemId !== 'string' || restaurantId) throw fail(400, 'Provide a food item to save.');
    if (!await foodWishlistData(menuItemId)) throw fail(404, 'Food item is not available.');
    const existing = await CustomerWishlistItem.findOne({ where: { customerId: req.customer.id, menuItemId } });
    if (existing) return send(res, existing, 200, 'Food item is already in your wishlist.');
    return send(res, await CustomerWishlistItem.create({ customerId: req.customer.id, targetType: 'food', menuItemId }), 201, 'Food item saved.');
  }
  throw fail(400, 'type must be restaurant or food.');
});
exports.removeWishlist = wrap(async (req, res) => {
  const row = await CustomerWishlistItem.findOne({ where: { id: req.params.wishlistItemId, customerId: req.customer.id } });
  if (!row) throw fail(404, 'Wishlist item not found.');
  await row.destroy();
  send(res, { id: row.id }, 200, 'Wishlist item removed.');
});

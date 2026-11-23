const crypto = require('node:crypto');
const Razorpay = require('razorpay');
const { Op } = require('sequelize');
const { User, Restaurant, Branch, RestaurantTable, MenuItem, MenuCategory, MenuItemOption, CustomerCart, CustomerCartItem, CustomerReorderRequest, CustomerAddress, Order, OrderItem, OrderRefund, OrderPaymentAttempt, DeliveryAssignment, DeliveryStatusHistory, DeliverySetting, DeliveryLocation, RestaurantMember, KitchenStatusHistory, CodCollection } = require('../../models');
const { branchIsOpen } = require('../../services/branch-availability');
const { orderEligibleBranchWhere } = require('../../services/marketplace-branch-policy');
const { occupyForOrder, refreshAfterOrder, emitFloorEvent } = require('../../services/table-operations');
const { syncCommissionForOrder } = require('../../services/commission-ledger');
const { notifySuperAdmins } = require('../../services/admin-notifications');
const { createCustomerNotification } = require('../../services/customer-notifications');
const { validateFoodCoupon, recordCouponReservation: recordFoodCouponReservation, changeOrderCouponStatus, reReserveOrderCoupon } = require('../../services/food-coupons');
const { recordAuditEvent } = require('../../services/audit-log');

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const send = (res, data, status = 200, message) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });
const formatAddressParts = (parts) => {
  const seen = new Set();
  return parts.flatMap((part) => String(part || '').split(',')).map((part) => part.trim().replace(/^[^:]{1,24}:\s*/, '').replace(/[.\s]+$/, '')).filter((part) => {
    const key = part.toLocaleLowerCase().replace(/\s+/g, ' ');
    if (!key || seen.has(key)) return false;
    const componentAlreadyInAddress = [...seen].some((existing) => (` ${existing} `).includes(` ${key} `));
    if (componentAlreadyInAddress) return false;
    seen.add(key); return true;
  }).join(', ');
};
const displayAddress = (value) => {
  if (typeof value !== 'string') return value || null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return formatAddressParts([parsed.house, parsed.street, parsed.landmark, parsed.city, parsed.district, parsed.state, parsed.postalCode, parsed.country]);
  } catch {}
  return formatAddressParts([value]);
};
const cents = (value) => Math.round(Number(value || 0) * 100);
const cash = (value) => Number((value / 100).toFixed(2));
const RESTAURANT_PUBLIC = { approvalStatus: 'approved', listingStatus: 'published', marketplaceEnabled: true };
const PUBLIC_BRANCH = { ...orderEligibleBranchWhere(), dineInEnabled: true };
const ORDER_TYPES = ['delivery', 'takeaway', 'dine_in'];
const razorpayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const razorpayClient = () => {
  if (!razorpayConfigured()) throw fail(503, 'Online payment is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the backend environment and restart the API.');
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
};

function orderItemSnapshots(details, orderId) {
  return details.priced.map(({ item, variant, addons, line, unitCents, lineCents }) => ({
    orderId, menuItemId: item.id, itemName: item.name, itemDescription: item.description,
    variantName: variant?.name || null, variantOptionId: variant?.id || null,
    addonsSnapshot: addons.map((addon) => ({ id: addon.id, name: addon.name, price: Number(addon.price) })),
    quantity: line.quantity, unitPrice: cash(unitCents), lineTotal: cash(lineCents),
  }));
}

function orderValues(details, customer, key, paymentMethod) {
  const addressSnapshot = details.address ? JSON.stringify({ fullName: details.address.fullName, phone: details.address.phone, house: details.address.house, street: details.address.street, landmark: details.address.landmark, city: details.address.city, state: details.address.state, postalCode: details.address.postalCode, latitude: details.address.latitude, longitude: details.address.longitude }) : null;
  return {
    restaurantId: details.restaurant.id, customerId: customer.id, branchId: details.branch.id, tableId: details.table?.id || null,
    orderNumber: `FH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    status: 'pending', paymentStatus: 'pending', paymentMethod, orderType: details.type, idempotencyKey: key,
    subtotal: cash(details.subtotalCents), tax: 0, packagingFee: 0, deliveryFee: 0, discount: cash(details.discountCents || 0), couponCode: details.coupon?.coupon.code || null, couponSource: details.coupon?.source || null,
    total: cash(details.totalCents), customerName: customer.firstName + (customer.lastName ? ` ${customer.lastName}` : ''),
    customerPhone: details.address?.phone || customer.phone, customerEmail: customer.email,
    deliveryAddress: addressSnapshot, customerNotes: typeof details.notes === 'string' ? details.notes.trim() || null : null,
  };
}

async function currentCart(customerId, transaction, lock = false) {
  return CustomerCart.findOne({ where: { customerId }, include: [{ model: CustomerCartItem, as: 'items' }], transaction, ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
}

function qrTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function resolveTableQrToken(token, transaction, { allowOccupied = false } = {}) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw fail(404, 'This table QR code is invalid or unavailable.');
  const table = await RestaurantTable.findOne({
    where: { qrToken: token, isActive: true, occupancyStatus: allowOccupied ? { [Op.in]: ['available', 'occupied'] } : 'available' },
    include: [
      { model: Restaurant, as: 'restaurant', where: RESTAURANT_PUBLIC, attributes: ['id', 'name', 'slug', 'logo'], required: true },
      { model: Branch, as: 'branch', where: PUBLIC_BRANCH, attributes: ['id', 'restaurantId', 'name', 'city', 'isActive', 'dineInEnabled'], required: true },
    ],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!table || table.restaurantId !== table.branch.restaurantId) throw fail(404, 'This table QR code is invalid or unavailable.');
  return table;
}

async function validateCartTable(cart, transaction) {
  if (!cart?.tableId) return null;
  const stored = await RestaurantTable.findOne({ where: { id: cart.tableId, restaurantId: cart.restaurantId, branchId: cart.branchId, isActive: true, occupancyStatus: { [Op.in]: ['available', 'occupied'] } }, attributes: ['qrToken'], transaction });
  if (!stored?.qrToken || typeof cart.tableQrTokenHash !== 'string') throw fail(409, 'This table QR is no longer active. Clear the cart and scan the current table QR code.');
  const expected = Buffer.from(qrTokenHash(stored.qrToken), 'hex');
  const actual = Buffer.from(cart.tableQrTokenHash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw fail(409, 'This table QR has changed. Clear the cart and scan the current table QR code.');
  const table = await resolveTableQrToken(stored.qrToken, transaction, { allowOccupied: true });
  if (table.id !== cart.tableId) throw fail(409, 'This table QR no longer matches your cart. Clear the cart and scan again.');
  return table;
}

async function eligiblePair(restaurantId, branchId, transaction) {
  const lock = transaction ? { lock: transaction.LOCK.UPDATE } : {};
  const restaurant = await Restaurant.findOne({ where: { id: restaurantId, ...RESTAURANT_PUBLIC }, transaction, ...lock });
  if (!restaurant) throw fail(409, 'This restaurant is not currently accepting marketplace orders.');
  if (!restaurant.acceptingOrders) throw fail(409, 'This restaurant is temporarily not accepting new orders. Please try again later.');
  const branch = await Branch.findOne({ where: { id: branchId, restaurantId, ...orderEligibleBranchWhere() }, transaction, ...lock });
  if (!branch) {
    const unavailable = await Branch.findOne({ where: { id: branchId, restaurantId }, attributes: ['id','operationalStatus'], transaction, ...lock });
    if (unavailable?.operationalStatus === 'temporarily_closed') throw fail(409, 'This branch is temporarily closed and is not accepting new orders.');
    throw fail(409, 'This branch is no longer available for ordering.');
  }
  return { restaurant, branch };
}

async function resolveSelection({ restaurantId, itemId, variantId, addonIds = [], quantity = 1, transaction }) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw fail(400, 'Quantity must be a whole number from 1 to 99.');
  if (!Array.isArray(addonIds) || addonIds.length > 30 || addonIds.some((id) => typeof id !== 'string') || new Set(addonIds).size !== addonIds.length) throw fail(400, 'Add-ons must be a list of unique menu option IDs.');
  const item = await MenuItem.findOne({ where: { id: itemId, restaurantId, isAvailable: true, isActive: true, moderationStatus: 'clear' }, include: [{ model: MenuCategory, as: 'category', where: { isActive: true }, required: true }], transaction, lock: transaction?.LOCK.UPDATE });
  if (!item) throw fail(409, 'This food item is unavailable. Remove it from your cart and refresh the menu.');
  const availableVariants = await MenuItemOption.findAll({ where: { menuItemId: item.id, restaurantId, type: 'variant' }, attributes: ['id'], transaction });
  if (availableVariants.length && !variantId) throw fail(400, 'Choose a variant for this food item.');
  let variant = null;
  if (variantId != null && variantId !== '') {
    variant = await MenuItemOption.findOne({ where: { id: variantId, menuItemId: item.id, restaurantId, type: 'variant' }, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
    if (!variant) throw fail(400, 'The selected variant is not available for this food item.');
  }
  const addons = addonIds.length ? await MenuItemOption.findAll({ where: { id: { [Op.in]: addonIds }, menuItemId: item.id, restaurantId, type: 'addon' }, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) }) : [];
  if (addons.length !== addonIds.length) throw fail(400, 'One or more selected add-ons are not available for this food item.');
  const unitCents = (variant ? cents(variant.price) : cents(item.discountedPrice ?? item.price)) + addons.reduce((sum, addon) => sum + cents(addon.price), 0);
  return { item, variant, addons, quantity, unitCents, lineCents: unitCents * quantity };
}

// Shared with POS so staff orders use the same current-price and option validation as customer checkout.
exports.resolveSelection = resolveSelection;

function sameSelection(row, variantId, addonIds) {
  const existing = [...(row.addonOptionIds || [])].sort();
  return (row.variantOptionId || null) === (variantId || null) && JSON.stringify(existing) === JSON.stringify([...addonIds].sort());
}

async function cartResponse(cart, transaction) {
  if (!cart) return { cart: null, restaurant: null, branch: null, items: [], subtotal: 0, itemCount: 0 };
  let table = null;
  let tableUnavailable = false;
  if (cart.tableId) {
    try { table = await validateCartTable(cart, transaction); }
    catch (error) {
      if (![404, 409].includes(error.status)) throw error;
      tableUnavailable = true;
    }
  }
  const [restaurant, branch] = await Promise.all([
    Restaurant.findByPk(cart.restaurantId, { attributes: ['id', 'name', 'slug', 'logo'], transaction }),
    Branch.findByPk(cart.branchId, { attributes: ['id', 'name', 'city', 'deliveryEnabled', 'takeawayEnabled', 'dineInEnabled', 'cashOnDeliveryEnabled', 'isActive', 'openingTime', 'closingTime', 'workingDays', 'overnight', 'timeZone', 'operationalStatus', 'approvalStatus'], transaction }),
  ]);
  let subtotalCents = 0; let itemCount = 0;
  const items = [];
  for (const line of cart.items || []) {
    const selection = await resolveSelection({ restaurantId: cart.restaurantId, itemId: line.menuItemId, variantId: line.variantOptionId, addonIds: line.addonOptionIds || [], quantity: line.quantity, transaction }).catch((error) => ({ unavailable: error.message }));
    if (selection.unavailable) {
      items.push({ id: line.id, menuItemId: line.menuItemId, variantOptionId: line.variantOptionId, addonOptionIds: line.addonOptionIds, quantity: line.quantity, available: false, unavailableReason: selection.unavailable, unitPrice: null, lineTotal: null });
      continue;
    }
    subtotalCents += selection.lineCents; itemCount += line.quantity;
    items.push({ id: line.id, menuItemId: line.menuItemId, name: selection.item.name, description: selection.item.description, imageUrl: selection.item.imageUrl, quantity: line.quantity, available: true, variant: selection.variant ? { id: selection.variant.id, name: selection.variant.name, price: Number(selection.variant.price) } : null, addons: selection.addons.map((a) => ({ id: a.id, name: a.name, price: Number(a.price) })), unitPrice: cash(selection.unitCents), lineTotal: cash(selection.lineCents) });
  }
  return { cart: { id: cart.id }, restaurant, branch, table: table ? { number: table.tableNumber } : cart.tableId ? { unavailable: true } : null, tableUnavailable, orderType: cart.tableId ? 'dine_in' : null, items, subtotal: cash(subtotalCents), itemCount };
}

async function getOrderType(branch, type) {
  if (!ORDER_TYPES.includes(type)) throw fail(400, 'Choose delivery, takeaway, or dine-in.');
  const supported = type === 'delivery' ? branch.deliveryEnabled : type === 'takeaway' ? branch.takeawayEnabled : branch.dineInEnabled;
  if (!supported) throw fail(409, `This branch does not offer ${type.replace('_', ' ')}.`);
  return type;
}

async function checkoutDetails(req, transaction, body = {}) {
  const cart = await currentCart(req.customer.id, transaction, true);
  if (!cart || !cart.items?.length) throw fail(409, 'Your cart is empty. Add menu items before checkout.');
  const { restaurant, branch } = await eligiblePair(cart.restaurantId, cart.branchId, transaction);
  if (!branchIsOpen(branch)) throw fail(409, 'This branch is closed now. You can place the order during its operating hours.');
  const table = await validateCartTable(cart, transaction);
  const requestedType = body.orderType || req.query.orderType;
  if (table && requestedType && requestedType !== 'dine_in') throw fail(400, 'This cart is linked to a table and must be checked out as dine-in.');
  if (!table && requestedType === 'dine_in') throw fail(409, 'Select a valid dine-in table before checkout.');
  const type = table ? await getOrderType(branch, 'dine_in') : await getOrderType(branch, requestedType || 'delivery');
  let address = null;
  const addressId = body.addressId || req.query.addressId;
  if (type === 'delivery') {
    if (!addressId) throw fail(400, 'Select a saved delivery address.');
    address = await CustomerAddress.findOne({ where: { id: addressId, customerId: req.customer.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!address) throw fail(400, 'Select a valid saved address.');
  }
  if (body.orderNotes != null && (typeof body.orderNotes !== 'string' || body.orderNotes.length > 2000)) throw fail(400, 'Order instructions must be 2,000 characters or fewer.');
  const priced = [];
  for (const line of cart.items) priced.push({ line, ...(await resolveSelection({ restaurantId: cart.restaurantId, itemId: line.menuItemId, variantId: line.variantOptionId, addonIds: line.addonOptionIds || [], quantity: line.quantity, transaction })) });
  const subtotalCents = priced.reduce((sum, x) => sum + x.lineCents, 0);
  let coupon = null; let discountCents = 0;
  const couponCode = typeof body.couponCode === 'string' ? body.couponCode.trim().toUpperCase() : '';
  if (couponCode) {
    if (couponCode.length > 40) throw fail(400, 'Coupon code is invalid.');
    coupon = await validateFoodCoupon({ code: couponCode, source: body.couponSource || 'platform_food', restaurantId: restaurant.id, customerId: req.customer.id, priced, subtotalCents, transaction });
    discountCents = coupon.discountCents;
  }
  const totalCents = Math.max(0, subtotalCents - discountCents);
  return { cart, restaurant, branch, table, type, address, priced, subtotalCents, discountCents, coupon, totalCents, notes: body.orderNotes };
}

exports.getCart = wrap(async (req, res) => {
  const cart = await currentCart(req.customer.id);
  send(res, await cartResponse(cart));
});

exports.addItem = wrap(async (req, res) => {
  const { restaurantId, branchId, menuItemId, variantOptionId = null, addonOptionIds = [], quantity = 1, tableQrToken } = req.body || {};
  if (typeof menuItemId !== 'string') throw fail(400, 'A food item is required.');
  const result = await CustomerCart.sequelize.transaction(async (transaction) => {
    await User.findByPk(req.customer.id, { transaction, lock: transaction.LOCK.UPDATE });
    const table = tableQrToken !== undefined ? await resolveTableQrToken(tableQrToken, transaction) : null;
    const resolvedRestaurantId = table?.restaurantId || restaurantId;
    const resolvedBranchId = table?.branchId || branchId;
    if (typeof resolvedRestaurantId !== 'string' || typeof resolvedBranchId !== 'string') throw fail(400, 'Restaurant and branch are required.');
    await eligiblePair(resolvedRestaurantId, resolvedBranchId, transaction);
    const selection = await resolveSelection({ restaurantId: resolvedRestaurantId, itemId: menuItemId, variantId: variantOptionId, addonIds: addonOptionIds, quantity, transaction });
    let cart = await currentCart(req.customer.id, transaction, true);
    if (cart) {
      const currentTable = await validateCartTable(cart, transaction);
      if (cart.restaurantId !== resolvedRestaurantId || cart.branchId !== resolvedBranchId || (cart.tableId || null) !== (table?.id || null)) throw fail(409, 'Your cart is already tied to another restaurant, branch, or table. Clear it before switching.');
      if (Boolean(currentTable) !== Boolean(table)) throw fail(409, 'Your cart fulfilment cannot be changed. Clear the cart before switching.');
    }
    if (!cart) cart = await CustomerCart.create({ customerId: req.customer.id, restaurantId: resolvedRestaurantId, branchId: resolvedBranchId, tableId: table?.id || null, tableQrTokenHash: table ? qrTokenHash(tableQrToken) : null }, { transaction });
    const rows = await CustomerCartItem.findAll({ where: { cartId: cart.id, menuItemId }, transaction, lock: transaction.LOCK.UPDATE });
    const same = rows.find((row) => sameSelection(row, variantOptionId, addonOptionIds));
    if (same) {
      if (same.quantity + quantity > 99) throw fail(400, 'A cart line cannot exceed 99 items.');
      await same.update({ quantity: same.quantity + quantity }, { transaction });
    } else await CustomerCartItem.create({ cartId: cart.id, menuItemId, variantOptionId: variantOptionId || null, addonOptionIds: [...addonOptionIds].sort(), quantity }, { transaction });
    cart = await currentCart(req.customer.id, transaction);
    return cartResponse(cart, transaction);
  });
  send(res, result, 201, 'Added to cart.');
});

exports.reorder = wrap(async (req, res) => {
  const { idempotencyKey } = req.body || {};
  if (typeof idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw fail(400, 'A valid reorder idempotency key is required.');
  const result = await CustomerCart.sequelize.transaction(async (transaction) => {
    await User.findByPk(req.customer.id, { transaction, lock: transaction.LOCK.UPDATE });
    const source = await Order.findOne({ where: { id: req.params.orderId, customerId: req.customer.id }, include: [{ model: OrderItem, as: 'items' }], transaction, lock: transaction.LOCK.UPDATE });
    if (!source) throw fail(404, 'Order not found.');
    const prior = await CustomerReorderRequest.findOne({ where: { customerId: req.customer.id, idempotencyKey }, transaction, lock: transaction.LOCK.UPDATE });
    if (prior) {
      if (prior.sourceOrderId !== source.id) throw fail(409, 'This idempotency key was already used for another order.');
      const cart = await currentCart(req.customer.id, transaction);
      return { result: await cartResponse(cart, transaction), replayed: true };
    }
    if (!source.items?.length || source.items.some((line) => !line.menuItemId)) throw fail(409, 'This order does not contain enough menu detail to reorder.');
    await eligiblePair(source.restaurantId, source.branchId, transaction);
    let cart = await currentCart(req.customer.id, transaction, true);
    if (cart?.tableId) throw fail(409, 'Your cart is linked to a dine-in table. Clear it before reordering for another fulfilment.');
    if (cart && (cart.restaurantId !== source.restaurantId || cart.branchId !== source.branchId)) throw fail(409, 'Your cart belongs to another restaurant or branch. Clear it before reordering.');
    const selections = [];
    for (const line of source.items) {
      const addonIds = (line.addonsSnapshot || []).map((addon) => addon.id);
      if (addonIds.some((id) => typeof id !== 'string')) throw fail(409, 'An item in this order has incomplete add-on details and cannot be reordered.');
      const selection = await resolveSelection({ restaurantId: source.restaurantId, itemId: line.menuItemId, variantId: line.variantOptionId, addonIds, quantity: line.quantity, transaction });
      selections.push({ line, addonIds, selection });
    }
    if (!cart) cart = await CustomerCart.create({ customerId: req.customer.id, restaurantId: source.restaurantId, branchId: source.branchId, tableId: null }, { transaction });
    for (const { line, addonIds } of selections) {
      const rows = await CustomerCartItem.findAll({ where: { cartId: cart.id, menuItemId: line.menuItemId }, transaction, lock: transaction.LOCK.UPDATE });
      const same = rows.find((row) => sameSelection(row, line.variantOptionId, addonIds));
      if (same) {
        if (same.quantity + line.quantity > 99) throw fail(409, 'Reordering would exceed the 99 item limit for a cart line.');
        await same.update({ quantity: same.quantity + line.quantity }, { transaction });
      } else await CustomerCartItem.create({ cartId: cart.id, menuItemId: line.menuItemId, variantOptionId: line.variantOptionId, addonOptionIds: [...addonIds].sort(), quantity: line.quantity }, { transaction });
    }
    await CustomerReorderRequest.create({ customerId: req.customer.id, sourceOrderId: source.id, idempotencyKey }, { transaction });
    cart = await currentCart(req.customer.id, transaction);
    return { result: await cartResponse(cart, transaction), replayed: false };
  });
  send(res, result.result, result.replayed ? 200 : 201, result.replayed ? 'Reorder already applied.' : 'Previous order added to your cart.');
});

exports.updateItem = wrap(async (req, res) => {
  const quantity = req.body?.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw fail(400, 'Quantity must be a whole number from 1 to 99.');
  const result = await CustomerCart.sequelize.transaction(async (transaction) => {
    const cart = await currentCart(req.customer.id, transaction, true);
    if (!cart) throw fail(404, 'Cart item not found.');
    await validateCartTable(cart, transaction);
    const line = await CustomerCartItem.findOne({ where: { id: req.params.itemId, cartId: cart.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!line) throw fail(404, 'Cart item not found.');
    await resolveSelection({ restaurantId: cart.restaurantId, itemId: line.menuItemId, variantId: line.variantOptionId, addonIds: line.addonOptionIds || [], quantity, transaction });
    await line.update({ quantity }, { transaction });
    return cartResponse(await currentCart(req.customer.id, transaction), transaction);
  });
  send(res, result);
});

exports.removeItem = wrap(async (req, res) => {
  const result = await CustomerCart.sequelize.transaction(async (transaction) => {
    const cart = await currentCart(req.customer.id, transaction, true);
    if (!cart) throw fail(404, 'Cart item not found.');
    await validateCartTable(cart, transaction);
    const line = await CustomerCartItem.findOne({ where: { id: req.params.itemId, cartId: cart.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!line) throw fail(404, 'Cart item not found.');
    await line.destroy({ transaction });
    const remaining = await CustomerCartItem.count({ where: { cartId: cart.id }, transaction });
    if (!remaining) { await cart.destroy({ transaction }); return cartResponse(null); }
    return cartResponse(await currentCart(req.customer.id, transaction), transaction);
  });
  send(res, result);
});

exports.clearCart = wrap(async (req, res) => {
  await CustomerCart.sequelize.transaction(async (transaction) => {
    await User.findByPk(req.customer.id, { transaction, lock: transaction.LOCK.UPDATE });
    await CustomerCart.destroy({ where: { customerId: req.customer.id }, transaction });
  });
  send(res, await cartResponse(null), 200, 'Cart cleared.');
});

exports.checkoutSummary = wrap(async (req, res) => {
  const result = await CustomerCart.sequelize.transaction((transaction) => checkoutDetails(req, transaction, req.query || {}));
  const priced = result.priced.map(({ line, item, variant, addons, unitCents, lineCents }) => ({ id: line.id, name: item.name, description: item.description, imageUrl: item.imageUrl, quantity: line.quantity, variant: variant ? { id: variant.id, name: variant.name } : null, addons: addons.map((a) => ({ id: a.id, name: a.name, price: Number(a.price) })), unitPrice: cash(unitCents), lineTotal: cash(lineCents) }));
  const codEnabled = Boolean(result.branch.cashOnDeliveryEnabled);
  const razorpayEnabled = Boolean(result.branch.razorpayEnabled && razorpayConfigured());
  const paymentMethods = [...(codEnabled ? ['cash_on_delivery'] : []), ...(razorpayEnabled ? ['razorpay'] : [])];
  send(res, { restaurant: { id: result.restaurant.id, name: result.restaurant.name, logo: result.restaurant.logo }, branch: { id: result.branch.id, name: result.branch.name, deliveryEnabled: result.branch.deliveryEnabled, takeawayEnabled: result.branch.takeawayEnabled, dineInEnabled: result.branch.dineInEnabled, cashOnDeliveryEnabled: codEnabled, razorpayEnabled: Boolean(result.branch.razorpayEnabled) }, ...(result.table ? { table: { number: result.table.tableNumber } } : {}), orderType: result.type, address: result.address, items: priced, subtotal: cash(result.subtotalCents), tax: 0, packagingFee: 0, deliveryFee: 0, discount: cash(result.discountCents || 0), coupon: result.coupon ? { code: result.coupon.coupon.code, name: result.coupon.coupon.name, source: result.coupon.source } : null, total: cash(result.totalCents), paymentMethods, paymentConfiguration: { cashOnDelivery: { enabled: codEnabled }, razorpay: { enabled: razorpayEnabled, configured: razorpayConfigured(), ...(razorpayEnabled ? { keyId: process.env.RAZORPAY_KEY_ID } : {}), ...(!razorpayConfigured() ? { message: 'Online payment is not configured. Contact support.' } : result.branch.razorpayEnabled ? {} : { message: 'Razorpay online payments are not enabled for this branch.' }) } }, pricingConfiguration: { taxConfigured: false, packagingFeeConfigured: false, deliveryFeeConfigured: false, couponsConfigured: true }, deliveryCoverageVerified: false });
});

exports.createIdempotencyKey = wrap(async (_req, res) => {
  send(res, { idempotencyKey: crypto.randomUUID() });
});

exports.validateCheckout = wrap(async (req, res) => {
  const result = await CustomerCart.sequelize.transaction((transaction) => checkoutDetails(req, transaction, req.body || {}));
  const method = req.body?.paymentMethod || 'cash_on_delivery';
  if (method === 'cash_on_delivery' && !result.branch.cashOnDeliveryEnabled) throw fail(409, 'This branch has not enabled cash on delivery.');
  if (method === 'razorpay' && (!result.branch.razorpayEnabled || !razorpayConfigured())) throw fail(409, !razorpayConfigured() ? 'Razorpay online payment is not configured on the server.' : 'This branch has not enabled Razorpay online payments.');
  if (!['cash_on_delivery', 'razorpay'].includes(method)) throw fail(400, 'Choose an available payment method.');
  send(res, { valid: true, restaurant: result.restaurant.name, branch: result.branch.name, orderType: result.type, subtotal: cash(result.subtotalCents), discount: cash(result.discountCents || 0), total: cash(result.totalCents), paymentMethod: method, deliveryCoverageVerified: result.type === 'delivery' ? false : null }, 200, 'Checkout is valid.');
});

exports.createRazorpayOrder = wrap(async (req, res) => {
  const key = req.body?.idempotencyKey;
  if (typeof key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw fail(400, 'A valid idempotency key is required.');
  const gateway = razorpayClient();
  const result = await Order.sequelize.transaction(async (transaction) => {
    let createdNewOrder = false;
    await User.findByPk(req.customer.id, { transaction, lock: transaction.LOCK.UPDATE });
    let order = await Order.findOne({ where: { customerId: req.customer.id, idempotencyKey: key }, transaction, lock: transaction.LOCK.UPDATE });
    let totalCents;
    if (order) {
      if (order.paymentMethod !== 'razorpay') throw fail(409, 'This checkout request already created a different payment method.');
      if (order.paymentStatus === 'paid') throw fail(409, 'This order is already paid.');
      if (['cancelled', 'rejected', 'completed'].includes(order.status)) throw fail(409, 'Payment cannot be retried for this order status.');
      const { branch } = await eligiblePair(order.restaurantId, order.branchId, transaction);
      if (!branch.razorpayEnabled) throw fail(409, 'This branch has disabled Razorpay online payments.');
      const priorLines = await OrderItem.findAll({ where: { orderId: order.id }, attributes: ['menuItemId'], transaction });
      const priorItemIds = [...new Set(priorLines.map((line) => line.menuItemId).filter(Boolean))];
      const eligibleItems = priorItemIds.length ? await MenuItem.findAll({ where: { id: { [Op.in]: priorItemIds }, restaurantId: order.restaurantId, isAvailable: true, isActive: true, moderationStatus: 'clear' }, include: [{ model: MenuCategory, as: 'category', where: { isActive: true }, required: true, attributes: [] }], attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE }) : [];
      if (eligibleItems.length !== priorItemIds.length || priorLines.some((line) => !line.menuItemId)) throw fail(409, 'A food item in this order is no longer available for purchase. Contact the restaurant for help.');
      if (order.razorpayOrderId && order.paymentStatus === 'pending') {
        await OrderPaymentAttempt.findOrCreate({ where: { gatewayOrderId: order.razorpayOrderId }, defaults: { orderId: order.id, restaurantId: order.restaurantId, branchId: order.branchId, gatewayOrderId: order.razorpayOrderId, amount: order.total, currency: 'INR', status: 'pending' }, transaction });
        return { order, razorpayOrder: { id: order.razorpayOrderId, amount: cents(order.total), currency: 'INR' }, createdNewOrder: false };
      }
      await reReserveOrderCoupon(order, transaction);
      totalCents = cents(order.total);
    } else {
      const details = await checkoutDetails(req, transaction, req.body);
      if (!details.branch.razorpayEnabled) throw fail(409, 'This branch has not enabled Razorpay online payments.');
      order = await Order.create(orderValues(details, req.customer, key, 'razorpay'), { transaction });
      createdNewOrder = true;
      await OrderItem.bulkCreate(orderItemSnapshots(details, order.id), { transaction });
      await createCustomerNotification({ app: req.app, customerId: req.customer.id, category: 'orders', title: 'Order placed', message: `Your order ${order.orderNumber} was placed and is awaiting payment.`, href: `/customer/orders/${order.id}`, entityId: order.id, dedupeKey: `order-created:${order.id}`, transaction });
      await recordFoodCouponReservation(details.coupon, req.customer.id, order, transaction, 'reserved');
      if (details.table) await occupyForOrder(details.table.id, transaction);
      totalCents = details.totalCents;
    }

    const razorpayOrder = await gateway.orders.create({
      amount: totalCents,
      currency: 'INR',
      receipt: `fh_${order.id.replaceAll('-', '').slice(0, 36)}`,
      notes: { foodiehubOrderId: order.id, customerId: req.customer.id },
    });
    await order.update({ razorpayOrderId: razorpayOrder.id, paymentStatus: 'pending' }, { transaction });
    await OrderPaymentAttempt.create({ orderId: order.id, restaurantId: order.restaurantId, branchId: order.branchId, gatewayOrderId: razorpayOrder.id, amount: Number((Number(razorpayOrder.amount) / 100).toFixed(2)), currency: razorpayOrder.currency || 'INR', status: 'pending' }, { transaction });
    return { order, razorpayOrder, createdNewOrder };
  });
  if (result.createdNewOrder) notifySuperAdmins(req, { type: 'new_order', title: 'New online order', message: `Order ${result.order.orderNumber} is awaiting payment.`, entityId: result.order.id, href: '/admin/orders' });
  if (result.order.tableId) emitFloorEvent(req, result.order.branchId, 'floor:occupancy-updated', { restaurantId: result.order.restaurantId, tableId: result.order.tableId, status: 'occupied' });
  send(res, { orderId: result.order.id, orderNumber: result.order.orderNumber, razorpayOrderId: result.razorpayOrder.id, keyId: process.env.RAZORPAY_KEY_ID, amount: result.razorpayOrder.amount, currency: result.razorpayOrder.currency, customer: { name: `${req.customer.firstName || ''} ${req.customer.lastName || ''}`.trim(), email: req.customer.email, contact: req.customer.phone } }, 201, 'Secure payment order created.');
});

exports.verifyRazorpayPayment = wrap(async (req, res) => {
  const { razorpay_payment_id: paymentId, razorpay_order_id: gatewayOrderId, razorpay_signature: signature } = req.body || {};
  if (![paymentId, gatewayOrderId, signature].every((value) => typeof value === 'string' && value.length > 0)) throw fail(400, 'The Razorpay payment response is incomplete.');
  const gateway = razorpayClient();
  const order = await Order.findOne({ where: { id: req.params.orderId, customerId: req.customer.id } });
  if (!order) throw fail(404, 'Order not found.');
  if (order.paymentMethod !== 'razorpay' || order.razorpayOrderId !== gatewayOrderId) throw fail(400, 'The payment does not match this order.');
  if (order.paymentStatus === 'paid') return send(res, { orderId: order.id, paymentStatus: 'paid' }, 200, 'Payment is already verified.');
  if (!/^[0-9a-f]{64}$/i.test(signature)) throw fail(400, 'Razorpay payment signature verification failed.');

  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${gatewayOrderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw fail(400, 'Razorpay payment signature verification failed.');

  let payment = await gateway.payments.fetch(paymentId);
  if (payment.order_id !== gatewayOrderId || Number(payment.amount) !== cents(order.total) || payment.currency !== 'INR') throw fail(409, 'Razorpay payment details do not match the full order amount.');
  if (payment.status === 'authorized') payment = await gateway.payments.capture(paymentId, cents(order.total), 'INR');
  if (payment.status !== 'captured') throw fail(409, 'Razorpay has not confirmed a captured payment for the full order amount.');

  let occupiedTableId = null;
  let capturedAfterCancellation = false;
  let verifiedOrderStatus = order.status;
  await Order.sequelize.transaction(async (transaction) => {
    const locked = await Order.findOne({ where: { id: order.id, customerId: req.customer.id }, transaction, lock: transaction.LOCK.UPDATE });
    verifiedOrderStatus = locked.status;
    capturedAfterCancellation = ['cancelled', 'rejected'].includes(locked.status);
    if (locked.paymentStatus === 'paid') return;
    if (locked.razorpayOrderId !== gatewayOrderId) throw fail(409, 'A newer payment attempt exists for this order.');
    await locked.update({ paymentStatus: 'paid', razorpayPaymentId: paymentId }, { transaction });
    await OrderPaymentAttempt.update({ gatewayPaymentId: paymentId, status: 'captured', capturedAt: new Date(), failureCode: null, failureDescription: null }, { where: { orderId: locked.id, gatewayOrderId }, transaction });
    await createCustomerNotification({ app: req.app, customerId: req.customer.id, category: 'payments', title: capturedAfterCancellation ? 'Payment captured for cancelled order' : 'Payment received', message: capturedAfterCancellation ? `A payment for cancelled order ${locked.orderNumber} was captured. Contact the restaurant to arrange a refund.` : `Payment for order ${locked.orderNumber} was verified.`, href: `/customer/orders/${locked.id}`, entityId: locked.id, dedupeKey: `payment-paid:${locked.id}`, transaction });
    if (capturedAfterCancellation) return;
    await syncCommissionForOrder(locked, transaction);
    await changeOrderCouponStatus(locked.id, 'redeemed', transaction);
    if (locked.tableId && locked.orderType === 'dine_in') {
      const table = await occupyForOrder(locked.tableId, transaction, { allowOccupied: true });
      occupiedTableId = table.id;
    }

    const cart = await CustomerCart.findOne({ where: { customerId: req.customer.id, restaurantId: locked.restaurantId, branchId: locked.branchId, tableId: locked.tableId }, include: [{ model: CustomerCartItem, as: 'items' }], transaction, lock: transaction.LOCK.UPDATE });
    if (cart?.items?.length) {
      const orderItems = await OrderItem.findAll({ where: { orderId: locked.id }, transaction });
      const lineKey = (line) => JSON.stringify([line.menuItemId, line.variantOptionId || null, [...(line.addonOptionIds || [])].sort(), line.quantity]);
      const cartLines = cart.items.map(lineKey).sort();
      const orderedLines = orderItems.map((line) => JSON.stringify([line.menuItemId, line.variantOptionId || null, (line.addonsSnapshot || []).map((addon) => addon.id).sort(), line.quantity])).sort();
      if (JSON.stringify(cartLines) === JSON.stringify(orderedLines)) await cart.destroy({ transaction });
    }
  });
  if (occupiedTableId) emitFloorEvent(req, order.branchId, 'floor:occupancy-updated', { restaurantId: order.restaurantId, tableId: occupiedTableId, status: 'occupied' });
  send(res, { orderId: order.id, orderStatus: verifiedOrderStatus, paymentStatus: 'paid', refundMayBeRequired: capturedAfterCancellation }, 200, capturedAfterCancellation ? 'Payment captured for a cancelled order. The restaurant must review the refund.' : 'Payment verified and order confirmed.');
});

exports.recordRazorpayFailure = wrap(async (req, res) => {
  const { paymentId, razorpayOrderId } = req.body || {};
  if (typeof paymentId !== 'string' || typeof razorpayOrderId !== 'string') throw fail(400, 'Razorpay failure details are incomplete.');
  let updatedOccupancy = null;
  let branchId = null;
  let restaurantId = null;
  let updatedTableId = null;
  await Order.sequelize.transaction(async (transaction) => {
    const order = await Order.findOne({ where: { id: req.params.orderId, customerId: req.customer.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) throw fail(404, 'Order not found.');
    if (order.paymentMethod !== 'razorpay' || order.razorpayOrderId !== razorpayOrderId) throw fail(400, 'The failed payment does not match this order.');
    if (order.paymentStatus === 'paid') throw fail(409, 'A verified payment cannot be changed to failed.');
    const payment = await razorpayClient().payments.fetch(paymentId);
    if (payment.order_id !== razorpayOrderId || payment.status !== 'failed') throw fail(409, 'Razorpay has not confirmed a failed attempt for this order.');
    await order.update({ paymentStatus: 'failed' }, { transaction });
    await OrderPaymentAttempt.update({ gatewayPaymentId: paymentId, status: 'failed', failureCode: payment.error_code || null, failureDescription: String(payment.error_description || payment.error_reason || '').slice(0, 500) || null }, { where: { orderId: order.id, gatewayOrderId }, transaction });
    await createCustomerNotification({ app: req.app, customerId: req.customer.id, category: 'payments', title: 'Payment did not complete', message: `Payment for order ${order.orderNumber} was not completed. You can retry from order details.`, href: `/customer/orders/${order.id}`, entityId: order.id, dedupeKey: `payment-failed:${order.id}:${paymentId}`, transaction });
    await changeOrderCouponStatus(order.id, 'released', transaction);
    branchId = order.branchId;
    restaurantId = order.restaurantId;
    const table = await refreshAfterOrder(order, transaction);
    updatedOccupancy = table?.occupancyStatus || null;
    updatedTableId = table?.id || null;
  });
  if (updatedOccupancy && branchId && updatedTableId) emitFloorEvent(req, branchId, 'floor:occupancy-updated', { restaurantId, tableId: updatedTableId, status: updatedOccupancy });
  notifySuperAdmins(req, { type: 'payment_failure', title: 'Order payment failed', message: `Payment failed for order ${req.params.orderId}.`, entityId: req.params.orderId, href: '/admin/orders' });
  send(res, { orderId: req.params.orderId, paymentStatus: 'failed' }, 200, 'Payment failure recorded. The order remains unpaid.');
});

exports.recordRazorpayCancellation = wrap(async (req, res) => {
  const gatewayOrderId = req.body?.razorpayOrderId;
  if (typeof gatewayOrderId !== 'string' || !gatewayOrderId) throw fail(400, 'Razorpay order identifier is required.');
  await Order.sequelize.transaction(async (transaction) => {
    const order = await Order.findOne({ where: { id: req.params.orderId, customerId: req.customer.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) throw fail(404, 'Order not found.');
    if (order.paymentMethod !== 'razorpay') throw fail(409, 'This order is not using Razorpay.');
    const attempt = await OrderPaymentAttempt.findOne({ where: { orderId: order.id, gatewayOrderId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!attempt) throw fail(404, 'Payment attempt not found.');
    if (attempt.status === 'pending' && order.paymentStatus !== 'paid') await attempt.update({ status: 'cancelled' }, { transaction });
  });
  send(res, { orderId: req.params.orderId, status: 'cancelled' }, 200, 'Payment window closure recorded.');
});

exports.placeOrder = wrap(async (req, res) => {
  if (req.body?.paymentMethod && req.body.paymentMethod !== 'cash_on_delivery') throw fail(400, 'Use the payment-specific checkout flow for the selected payment method.');
  const key = req.body?.idempotencyKey;
  if (typeof key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw fail(400, 'A valid idempotency key is required.');
  let existing = await Order.findOne({ where: { customerId: req.customer.id, idempotencyKey: key } });
  if (existing) {
    if (existing.paymentMethod !== 'cash_on_delivery') throw fail(409, 'This checkout request already created an online payment order.');
    return send(res, { order: existing, repeated: true }, 200, 'This order submission was already processed.');
  }
  try {
    const order = await Order.sequelize.transaction(async (transaction) => {
      await User.findByPk(req.customer.id, { transaction, lock: transaction.LOCK.UPDATE });
      existing = await Order.findOne({ where: { customerId: req.customer.id, idempotencyKey: key }, transaction, lock: transaction.LOCK.UPDATE });
      if (existing) {
        if (existing.paymentMethod !== 'cash_on_delivery') throw fail(409, 'This checkout request already created an online payment order.');
        return existing;
      }
      const details = await checkoutDetails(req, transaction, req.body);
      if (!details.branch.cashOnDeliveryEnabled) throw fail(409, 'This branch has not enabled cash on delivery.');
      const order = await Order.create(orderValues(details, req.customer, key, 'cash_on_delivery'), { transaction });
      await OrderItem.bulkCreate(orderItemSnapshots(details, order.id), { transaction });
      await createCustomerNotification({ app: req.app, customerId: req.customer.id, category: 'orders', title: 'Order placed', message: `Your order ${order.orderNumber} was sent to the restaurant.`, href: `/customer/orders/${order.id}`, entityId: order.id, dedupeKey: `order-created:${order.id}`, transaction });
      await recordFoodCouponReservation(details.coupon, req.customer.id, order, transaction, 'redeemed');
      if (details.table) await occupyForOrder(details.table.id, transaction);
      await details.cart.destroy({ transaction });
      return order;
    });
    const full = await Order.findOne({ where: { id: order.id, customerId: req.customer.id }, include: [{ model: OrderItem, as: 'items' }, { model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'slug'] }, { model: Branch, as: 'branch', attributes: ['id', 'name', 'city'] }] });
    if (!existing) notifySuperAdmins(req, { type: 'new_order', title: 'New cash on delivery order', message: `Order ${full.orderNumber} was placed.`, entityId: full.id, href: '/admin/orders' });
    if (!existing && full?.tableId) emitFloorEvent(req, full.branchId, 'floor:occupancy-updated', { restaurantId: full.restaurantId, tableId: full.tableId, status: 'occupied' });
    return send(res, { order: full, repeated: Boolean(existing) }, existing ? 200 : 201, existing ? 'This order submission was already processed.' : 'Order placed.');
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const duplicate = await Order.findOne({ where: { customerId: req.customer.id, idempotencyKey: key } });
      if (duplicate) {
        if (duplicate.paymentMethod !== 'cash_on_delivery') throw fail(409, 'This checkout request already created an online payment order.');
        return send(res, { order: duplicate, repeated: true }, 200, 'This order submission was already processed.');
      }
    }
    throw error;
  }
});

exports.getOrder = wrap(async (req, res) => {
  const order = await Order.findOne({ where: { id: req.params.orderId, customerId: req.customer.id }, include: [{ model: OrderItem, as: 'items', include: [{ model: MenuItem, as: 'menuItem', attributes: ['imageUrl'], required: false }] }, { model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'slug'] }, { model: Branch, as: 'branch', attributes: ['id', 'name', 'city', 'phone', 'addressLine', 'addressLine2', 'landmark', 'state', 'postalCode', 'country', 'latitude', 'longitude'], required: false }, { model: RestaurantTable, as: 'table', attributes: ['tableNumber'], required: false }, { model: OrderRefund, as: 'refund', attributes: ['id', 'amount', 'reason', 'status', 'providerStatus', 'razorpayRefundId', 'createdAt', 'processedAt'], required: false }] });
  if (!order) throw fail(404, 'Order not found.');
  order.setDataValue('deliveryOtpHash', undefined);
  if (order.orderType === 'delivery') {
    const assignments = await DeliveryAssignment.findAll({ where: { orderId: order.id, restaurantId: order.restaurantId }, include: [{ model: RestaurantMember, as: 'deliveryEmployee', attributes: ['id', 'status'], include: [{ model: User, as: 'user', attributes: ['firstName', 'phone', 'status'], required: true }] }], order: [['assignedAt', 'DESC'], ['createdAt', 'DESC']] });
    const activeStatuses = ['pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer'];
    const assignment = assignments.find((row) => activeStatuses.includes(row.status))
      || (order.status === 'completed' ? assignments.find((row) => row.status === 'delivered') : null)
      || assignments.find((row) => row.status !== 'reassigned')
      || assignments[0]
      || null;
    const [history, kitchenHistory, codCollection] = await Promise.all([
      assignment ? DeliveryStatusHistory.findAll({ where: { restaurantId: order.restaurantId, orderId: order.id }, attributes: ['id', 'event', 'fromStatus', 'toStatus', 'createdAt'], order: [['createdAt', 'ASC']] }) : [],
      KitchenStatusHistory.findAll({ where: { restaurantId: order.restaurantId, orderId: order.id }, attributes: ['id', 'fromStatus', 'toStatus', 'notes', 'createdAt'], order: [['createdAt', 'ASC']] }),
      order.paymentMethod === 'cash_on_delivery' ? CodCollection.findOne({ where: { restaurantId: order.restaurantId, orderId: order.id }, attributes: ['id', 'expectedAmount', 'collectedAmount', 'status', 'resolutionStatus', 'collectedAt'], order: [['createdAt', 'DESC']] }) : null,
    ]);
    const branch = order.branch;
    let destinationCoordinates = {};
    try { const snapshot = JSON.parse(order.deliveryAddress || 'null'); if (snapshot?.latitude != null && snapshot.latitude !== '' && snapshot?.longitude != null && snapshot.longitude !== '' && Number.isFinite(Number(snapshot.latitude)) && Number.isFinite(Number(snapshot.longitude))) destinationCoordinates = { latitude: Number(snapshot.latitude), longitude: Number(snapshot.longitude) }; } catch {}
    const active = assignment && ['pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer'].includes(assignment.status) && !['completed', 'cancelled', 'rejected'].includes(order.status);
    const deliverySetting = branch ? await DeliverySetting.findOne({ where: { restaurantId: order.restaurantId, branchId: branch.id } }) || await DeliverySetting.findOne({ where: { restaurantId: order.restaurantId, branchId: null } }) : null;
    const locationEligible = active && assignment.status !== 'pending_acceptance' && deliverySetting?.locationSharingEnabled;
    const liveLocation = locationEligible ? await DeliveryLocation.findOne({ where: { restaurantId: order.restaurantId, orderId: order.id, assignmentId: assignment.id, expiresAt: { [Op.gt]: new Date() } }, attributes: ['latitude', 'longitude', 'accuracyMeters', 'capturedAt'] }) : null;
    order.setDataValue('deliveryTracking', {
      status: assignment?.status || 'pending_assignment',
      restaurantStatus: order.status,
      kitchenStatus: order.kitchenStatus,
      kitchenHistory,
      codCollection,
      restaurantStatusUpdatedAt: order.updatedAt,
      assignedAt: assignment?.assignedAt || null,
      acceptedAt: assignment?.acceptedAt || null,
      completedAt: assignment?.completedAt || null,
      employee: active && assignment.status !== 'pending_acceptance' && assignment.deliveryEmployee?.status === 'active' && assignment.deliveryEmployee.user?.status === 'active' ? { firstName: assignment.deliveryEmployee.user.firstName, phone: assignment.deliveryEmployee.user.phone || null, profilePhotoUrl: null } : null,
      pickup: branch ? { name: branch.name, address: formatAddressParts([branch.addressLine, branch.addressLine2, branch.landmark, branch.city, branch.state, branch.postalCode, branch.country]), phone: branch.phone, latitude: branch.latitude, longitude: branch.longitude } : null,
      destination: { address: displayAddress(order.deliveryAddress), ...destinationCoordinates },
      currentLocation: liveLocation ? { latitude: Number(liveLocation.latitude), longitude: Number(liveLocation.longitude), accuracyMeters: liveLocation.accuracyMeters == null ? null : Number(liveLocation.accuracyMeters), capturedAt: liveLocation.capturedAt } : null,
      eta: null,
      liveLocationAvailable: Boolean(liveLocation),
      history: [...history, ...kitchenHistory.map((entry) => ({ ...entry.toJSON(), event: 'kitchen_status' }))].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    });
  }
  send(res, order);
});

exports.cancelOrder = wrap(async (req, res) => {
  let order;
  let updatedTable = null;
  let cancelledAssignments = [];
  let repeated = false;
  await Order.sequelize.transaction(async (transaction) => {
    order = await Order.findOne({
      where: { id: req.params.orderId, customerId: req.customer.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw fail(404, 'Order not found.');
    if (order.status === 'cancelled') { repeated = true; return; }
    if (order.status !== 'pending') throw fail(409, 'This order can no longer be cancelled by the customer. Contact the restaurant for help.');

    const before = { status: order.status, paymentStatus: order.paymentStatus };
    await order.update({ status: 'cancelled', cancelledAt: new Date() }, { transaction });
    await changeOrderCouponStatus(order.id, 'released', transaction, true);
    await syncCommissionForOrder(order, transaction);
    if (order.orderType === 'delivery') {
      const active = await DeliveryAssignment.findAll({
        where: { orderId: order.id, restaurantId: order.restaurantId, status: { [Op.in]: ['pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer'] } },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      for (const assignment of active) {
        const previousStatus = assignment.status;
        await DeliveryLocation.destroy({ where: { assignmentId: assignment.id }, transaction });
        await assignment.update({ status: 'cancelled', notes: 'Order cancelled by customer.' }, { transaction });
        await DeliveryStatusHistory.create({ restaurantId: order.restaurantId, branchId: assignment.branchId, orderId: order.id, assignmentId: assignment.id, restaurantMemberId: assignment.restaurantMemberId, performedByUserId: req.customer.id, event: 'cancelled', fromStatus: previousStatus, toStatus: 'cancelled', notes: 'Order cancelled by customer.' }, { transaction });
        const remaining = await DeliveryAssignment.count({ where: { restaurantId: order.restaurantId, restaurantMemberId: assignment.restaurantMemberId, status: { [Op.in]: ['pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer'] } }, transaction });
        await RestaurantMember.update({ availabilityStatus: remaining ? 'on_delivery' : 'available' }, { where: { id: assignment.restaurantMemberId, restaurantId: order.restaurantId }, transaction });
        cancelledAssignments.push(assignment);
      }
    }
    updatedTable = await refreshAfterOrder(order, transaction);
    await recordAuditEvent(req, { action: 'customer.order.cancelled', entityType: 'order', entityId: order.id, beforeData: before, afterData: { status: 'cancelled', paymentStatus: order.paymentStatus } }, { transaction });
    await createCustomerNotification({ app: req.app, customerId: req.customer.id, category: 'orders', title: 'Order cancelled', message: `Your order ${order.orderNumber} was cancelled. Payment status remains ${order.paymentStatus}.`, href: `/customer/orders/${order.id}`, entityId: order.id, dedupeKey: `customer-order-cancelled:${order.id}`, transaction });
  });
  if (updatedTable) emitFloorEvent(req, order.branchId, 'floor:occupancy-updated', { restaurantId: order.restaurantId, tableId: updatedTable.id, status: updatedTable.occupancyStatus });
  const io = req.app.get('io');
  if (io) for (const assignment of cancelledAssignments) {
    io.to(`delivery:${order.restaurantId}:${assignment.branchId}`).emit('delivery:assignment-updated', { orderId: order.id, assignmentId: assignment.id, status: 'cancelled' });
    io.to(`delivery-employee:${order.restaurantId}:${assignment.restaurantMemberId}`).emit('delivery:assignment-updated', { orderId: order.id, assignmentId: assignment.id, status: 'cancelled' });
  }
  if (io && order.orderType === 'delivery') io.to(`customer:${req.customer.id}`).emit('delivery:customer-updated', { orderId: order.id, status: 'cancelled' });
  send(res, { id: order.id, status: order.status, paymentStatus: order.paymentStatus, repeated }, 200, repeated ? 'This order was already cancelled.' : 'Order cancelled. Payment status has not been changed.');
});

const { Op, fn, col } = require('sequelize');
const QRCode = require('qrcode');
const { Restaurant, Branch, RestaurantTable, MenuCategory, MenuItem, MenuItemOption } = require('../../models');
const { branchIsOpen } = require('../../services/branch-availability');
const { marketplaceBranchWhere } = require('../../services/marketplace-branch-policy');
const { getPublicAppUrl } = require('../../utils/public-app-url');
const { buildTableQrPayload } = require('../../utils/table-qr');

const PUBLIC_RESTAURANT = { approvalStatus: 'approved', listingStatus: 'published', marketplaceEnabled: true };
const PUBLIC_BRANCH = marketplaceBranchWhere();
const fail = (status, message) => Object.assign(new Error(message), { status });
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };

function publicBranch(branch, now, acceptingOrders = true) {
  const value = branch.toJSON ? branch.toJSON() : branch;
  return {
    id: value.id, name: value.name,
    phone: value.phone, addressLine: value.addressLine, addressLine2: value.addressLine2,
    landmark: value.landmark, city: value.city, state: value.state, postalCode: value.postalCode, country: value.country,
    latitude: value.latitude, longitude: value.longitude,
    openingTime: value.openingTime, closingTime: value.closingTime, timeZone: value.timeZone,
    workingDays: value.workingDays || [], closedDays: value.closedDays || [], overnight: Boolean(value.overnight),
    dineInEnabled: Boolean(value.dineInEnabled), takeawayEnabled: Boolean(value.takeawayEnabled), deliveryEnabled: Boolean(value.deliveryEnabled),
    approvalStatus: value.approvalStatus,
    approvalLabel: value.approvalStatus === 'pending' ? 'Pending Approval' : 'Approved',
    isOpen: acceptingOrders && branchIsOpen(value, now),
    acceptingOrders,
  };
}

function publicRestaurant(restaurant, branches, averagePreparationTime = null, now = new Date()) {
  const acceptingOrders = Boolean(restaurant.acceptingOrders);
  const branchData = branches.map((branch) => publicBranch(branch, now, acceptingOrders));
  return {
    id: restaurant.id, slug: restaurant.slug, name: restaurant.name, description: restaurant.description,
    logo: restaurant.logo, image: restaurant.logo, cuisines: [], rating: null, minimumOrderAmount: null,
    averagePreparationTime: averagePreparationTime == null ? null : Math.round(Number(averagePreparationTime)),
    branches: branchData, isOpen: branchData.some((branch) => branch.isOpen), acceptingOrders,
    deliveryAvailable: branchData.some((branch) => branch.deliveryEnabled),
    takeawayAvailable: branchData.some((branch) => branch.takeawayEnabled),
    dineInAvailable: branchData.some((branch) => branch.dineInEnabled),
    cities: [...new Set(branchData.map((branch) => branch.city).filter(Boolean))],
  };
}

function parseBooleanFilter(value, name) {
  if (value === undefined || value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw fail(400, `${name} must be true or false.`);
}

async function eligibleBranches(where = {}) {
  return Branch.findAll({ where: { ...PUBLIC_BRANCH, ...where }, include: [{ model: Restaurant, as: 'restaurant', where: PUBLIC_RESTAURANT, required: true, attributes: ['id', 'slug', 'name', 'description', 'logo', 'acceptingOrders'] }], order: [['isPrimary', 'DESC'], ['createdAt', 'ASC']] });
}

async function categoryIdsForFilter(category) {
  if (!category) return null;
  const rows = await MenuCategory.findAll({ where: { isActive: true, [Op.or]: [{ id: category }, { name: { [Op.like]: `%${String(category).slice(0, 80)}%` } }] }, attributes: ['id'] });
  return rows.map((row) => row.id);
}

async function restaurantsMatchingMenu(search, foodType, categoryIds, restaurantIds) {
  if (!search && !foodType && !categoryIds) return null;
  const itemWhere = { restaurantId: { [Op.in]: restaurantIds }, isAvailable: true, isActive: true, moderationStatus: 'clear' };
  if (foodType) itemWhere.foodType = foodType;
  if (categoryIds) itemWhere.categoryId = { [Op.in]: categoryIds.length ? categoryIds : ['00000000-0000-0000-0000-000000000000'] };
  const categoryWhere = { isActive: true };
  if (search) categoryWhere.name = { [Op.like]: `%${search}%` };
  const items = await MenuItem.findAll({
    where: itemWhere,
    attributes: ['restaurantId'],
    include: [{ model: MenuCategory, as: 'category', where: categoryWhere, required: true, attributes: [] }],
    group: ['MenuItem.restaurant_id'],
    raw: true,
  });
  if (search) {
    const nameWhere = { restaurantId: { [Op.in]: restaurantIds }, isAvailable: true, isActive: true, moderationStatus: 'clear', name: { [Op.like]: `%${search}%` } };
    if (foodType) nameWhere.foodType = foodType;
    if (categoryIds) nameWhere.categoryId = { [Op.in]: categoryIds.length ? categoryIds : ['00000000-0000-0000-0000-000000000000'] };
    const nameRows = await MenuItem.findAll({ where: nameWhere, include: [{ model: MenuCategory, as: 'category', where: { isActive: true }, required: true, attributes: [] }], attributes: ['restaurantId'], group: ['MenuItem.restaurant_id'], raw: true });
    items.push(...nameRows);
  }
  return [...new Set(items.map((item) => item.restaurantId))];
}

exports.listRestaurants = handle(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 12, 1), 48);
  const search = String(req.query.search || '').trim().slice(0, 100);
  const foodType = req.query.foodType || '';
  if (foodType && !['veg', 'non_veg', 'egg'].includes(foodType)) throw fail(400, 'foodType must be veg, non_veg, or egg.');
  const categoryIds = await categoryIdsForFilter(req.query.category);
  const serviceFilters = {};
  for (const service of ['delivery', 'takeaway', 'dineIn']) {
    const value = parseBooleanFilter(req.query[service], service);
    if (value !== null) serviceFilters[{ delivery: 'deliveryEnabled', takeaway: 'takeawayEnabled', dineIn: 'dineInEnabled' }[service]] = value;
  }
  const branches = await eligibleBranches({ ...serviceFilters, ...(req.query.city ? { city: { [Op.like]: `%${String(req.query.city).trim().slice(0, 80)}%` } } : {}) });
  let grouped = new Map();
  for (const branch of branches) {
    const restaurant = branch.restaurant;
    if (!grouped.has(restaurant.id)) grouped.set(restaurant.id, { restaurant, branches: [] });
    grouped.get(restaurant.id).branches.push(branch);
  }
  let candidates = [...grouped.values()];
  const candidateIds = candidates.map(({ restaurant }) => restaurant.id);
  if (req.query.category || foodType) {
    const filterMatches = new Set(await restaurantsMatchingMenu('', foodType, categoryIds, candidateIds));
    candidates = candidates.filter(({ restaurant }) => filterMatches.has(restaurant.id));
  }
  if (search) {
    const searchIds = candidates.map(({ restaurant }) => restaurant.id);
    const menuMatches = new Set(await restaurantsMatchingMenu(search, '', null, searchIds));
    candidates = candidates.filter(({ restaurant, branches: restaurantBranches }) => restaurant.name.toLowerCase().includes(search.toLowerCase()) || restaurantBranches.some((branch) => branch.city.toLowerCase().includes(search.toLowerCase())) || menuMatches.has(restaurant.id));
  }
  const now = new Date();
  if (parseBooleanFilter(req.query.openNow, 'openNow') === true) candidates = candidates.filter(({ restaurant, branches: items }) => restaurant.acceptingOrders && items.some((branch) => branchIsOpen(branch, now)));
  if (parseBooleanFilter(req.query.openNow, 'openNow') === false) candidates = candidates.filter(({ restaurant, branches: items }) => !restaurant.acceptingOrders || items.every((branch) => !branchIsOpen(branch, now)));
  const validSorts = ['relevance', 'preparationTime'];
  const sort = req.query.sort || 'relevance';
  if (!validSorts.includes(sort)) throw fail(400, 'Supported sort values are relevance and preparationTime. Rating data is not available.');
  const allIds = candidates.map(({ restaurant }) => restaurant.id);
  const prepRows = allIds.length ? await MenuItem.findAll({ where: { restaurantId: { [Op.in]: allIds }, isAvailable: true, isActive: true, moderationStatus: 'clear', preparationTime: { [Op.ne]: null } }, include: [{ model: MenuCategory, as: 'category', where: { isActive: true }, required: true, attributes: [] }], attributes: ['restaurantId', [fn('AVG', col('preparation_time')), 'averagePreparationTime']], group: ['MenuItem.restaurant_id'], raw: true }) : [];
  const prepMap = new Map(prepRows.map((row) => [row.restaurantId, row.averagePreparationTime]));
  if (sort === 'preparationTime') candidates.sort((a, b) => (prepMap.get(a.restaurant.id) == null ? Infinity : Number(prepMap.get(a.restaurant.id))) - (prepMap.get(b.restaurant.id) == null ? Infinity : Number(prepMap.get(b.restaurant.id))));
  else if (search) candidates.sort((a, b) => {
    const score = ({ restaurant, branches: items }) => restaurant.name.toLowerCase() === search.toLowerCase() ? 0 : restaurant.name.toLowerCase().startsWith(search.toLowerCase()) ? 1 : restaurant.name.toLowerCase().includes(search.toLowerCase()) ? 2 : items.some((branch) => branch.city.toLowerCase().includes(search.toLowerCase())) ? 3 : 4;
    return score(a) - score(b);
  });
  const total = candidates.length;
  const slice = candidates.slice((page - 1) * limit, page * limit);
  const facetRestaurantIds = candidates.map(({ restaurant }) => restaurant.id);
  const facetItemRows = facetRestaurantIds.length ? await MenuItem.findAll({ where: { restaurantId: { [Op.in]: facetRestaurantIds }, isAvailable: true, isActive: true, moderationStatus: 'clear' }, attributes: ['categoryId'], include: [{ model: MenuCategory, as: 'category', where: { isActive: true }, required: true, attributes: [] }], group: ['MenuItem.category_id'], raw: true }) : [];
  const facetCategoryIds = facetItemRows.map((row) => row.categoryId);
  const facets = facetCategoryIds.length ? await MenuCategory.findAll({ where: { isActive: true, id: { [Op.in]: facetCategoryIds } }, attributes: ['id', 'name', 'displayOrder'], order: [['displayOrder', 'ASC'], ['name', 'ASC']] }) : [];
  send(res, { restaurants: slice.map(({ restaurant, branches: items }) => publicRestaurant(restaurant, items, prepMap.get(restaurant.id), now)), filters: { categories: facets }, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
});

async function findListedRestaurant(slug) {
  const restaurant = await Restaurant.findOne({ where: { slug, ...PUBLIC_RESTAURANT }, attributes: ['id', 'slug', 'name', 'description', 'logo', 'acceptingOrders'] });
  if (!restaurant) throw fail(404, 'Restaurant not found.');
  const branches = await Branch.findAll({ where: { restaurantId: restaurant.id, ...PUBLIC_BRANCH }, order: [['isPrimary', 'DESC'], ['createdAt', 'ASC']] });
  if (!branches.length) throw fail(404, 'Restaurant not found.');
  return { restaurant, branches };
}

function selectBranch(branches, branchId) {
  if (!branchId) return null;
  const branch = branches.find((item) => item.id === branchId);
  if (!branch) throw fail(404, 'Branch not found.');
  return branch;
}

exports.restaurantDetails = handle(async (req, res) => {
  const { restaurant, branches } = await findListedRestaurant(req.params.slug);
  const now = new Date();
  const selected = selectBranch(branches, req.query.branchId);
  const categoryCount = await MenuCategory.count({ where: { isActive: true, [Op.or]: [{ scope: 'global', restaurantId: null }, { scope: 'restaurant', restaurantId: restaurant.id }] } });
  send(res, { ...publicRestaurant(restaurant, selected ? [selected] : branches, null, now), ...(selected ? { selectedBranchId: selected.id } : {}), activeCategoryCount: categoryCount });
});

exports.restaurantBranches = handle(async (req, res) => {
  const { branches } = await findListedRestaurant(req.params.slug);
  const now = new Date();
  const { restaurant } = await findListedRestaurant(req.params.slug);
  send(res, branches.map((branch) => publicBranch(branch, now, restaurant.acceptingOrders)));
});

exports.restaurantQr = handle(async (req, res) => {
  const { restaurant } = await findListedRestaurant(req.params.slug);
  const url = new URL(`/restaurants/${encodeURIComponent(restaurant.slug)}`, `${getPublicAppUrl()}/`);
  const imageDataUrl = await QRCode.toDataURL(url.toString(), { errorCorrectionLevel: 'H', margin: 4, width: 480 });
  const safeName = restaurant.slug.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'restaurant';
  send(res, { restaurantName: restaurant.name, qrUrl: url.toString(), imageDataUrl, downloadName: `foodiehub-${safeName}-menu-qr.png` });
});

exports.restaurantBranchTables = handle(async (req, res) => {
  const { restaurant, branches } = await findListedRestaurant(req.params.slug);
  const branch = selectBranch(branches, req.params.branchId);
  if (!branch.dineInEnabled) throw fail(409, 'This branch does not offer dine-in.');
  const tables = await RestaurantTable.findAll({
    where: { restaurantId: restaurant.id, branchId: branch.id, isActive: true, occupancyStatus: 'available', qrToken: { [Op.ne]: null } },
    attributes: ['id', 'tableNumber', 'seatingCapacity'],
    order: [['tableNumber', 'ASC']],
  });
  send(res, tables.map((table) => ({ id: table.id, number: table.tableNumber, seatingCapacity: table.seatingCapacity })));
});

exports.selectRestaurantTable = handle(async (req, res) => {
  const { restaurant, branches } = await findListedRestaurant(req.params.slug);
  const branch = selectBranch(branches, req.params.branchId);
  if (!branch.dineInEnabled) throw fail(409, 'This branch does not offer dine-in.');
  const table = await RestaurantTable.findOne({
    where: { id: req.params.tableId, restaurantId: restaurant.id, branchId: branch.id, isActive: true, occupancyStatus: 'available' },
    attributes: ['id', 'tableNumber', 'qrToken'],
  });
  if (!table?.qrToken) throw fail(404, 'This table is not available for online dine-in ordering.');
  const qr = await buildTableQrPayload(table);
  send(res, { table: { id: table.id, number: table.tableNumber }, tableQrToken: table.qrToken, ...qr });
});

exports.restaurantBranchQr = handle(async (req, res) => {
  const { restaurant, branches } = await findListedRestaurant(req.params.slug);
  const branch = selectBranch(branches, req.params.branchId);
  const url = new URL(`/restaurants/${encodeURIComponent(restaurant.slug)}`, `${getPublicAppUrl()}/`);
  url.searchParams.set('branchId', branch.id);
  const imageDataUrl = await QRCode.toDataURL(url.toString(), { errorCorrectionLevel: 'H', margin: 4, width: 480 });
  const safeName = `${restaurant.slug}-${branch.name}`.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'restaurant-menu';
  send(res, { restaurantName: restaurant.name, branchName: branch.name, qrUrl: url.toString(), imageDataUrl, downloadName: `foodiehub-${safeName}-menu-qr.png` });
});

exports.restaurantMenu = handle(async (req, res) => {
  const { restaurant, branches } = await findListedRestaurant(req.params.slug);
  selectBranch(branches, req.query.branchId);
  const categories = await MenuCategory.findAll({
    where: { isActive: true, [Op.or]: [{ scope: 'global', restaurantId: null }, { scope: 'restaurant', restaurantId: restaurant.id }] },
    include: [{ model: MenuItem, as: 'items', where: { restaurantId: restaurant.id, isAvailable: true, isActive: true, moderationStatus: 'clear' }, required: false, include: [{ model: MenuItemOption, as: 'options', attributes: ['id', 'type', 'name', 'price', 'displayOrder'] }] }],
    order: [['displayOrder', 'ASC'], ['name', 'ASC'], [{ model: MenuItem, as: 'items' }, 'displayOrder', 'ASC'], [{ model: MenuItem, as: 'items' }, 'name', 'ASC']],
  });
  send(res, categories.map((category) => ({ id: category.id, name: category.name, description: category.description, displayOrder: category.displayOrder, items: (category.items || []).filter((item) => item.isAvailable).map((item) => ({ id: item.id, name: item.name, description: item.description, price: item.price, discountedPrice: item.discountedPrice, imageUrl: item.imageUrl, foodType: item.foodType, dietaryTags: item.dietaryTags || [], allergenTags: item.allergenTags || [], preparationTime: item.preparationTime, isFeatured: item.isFeatured, displayOrder: item.displayOrder, options: (item.options || []).sort((a, b) => a.displayOrder - b.displayOrder).map((option) => ({ id: option.id, type: option.type, name: option.name, price: option.price, displayOrder: option.displayOrder })) })) })));
});

exports.menuItemDetails = handle(async (req, res) => {
  const item = await MenuItem.findOne({ where: { id: req.params.id, isAvailable: true, isActive: true, moderationStatus: 'clear' }, include: [{ model: MenuCategory, as: 'category', where: { isActive: true }, required: true }, { model: MenuItemOption, as: 'options', attributes: ['id', 'type', 'name', 'price', 'displayOrder'] }] });
  if (!item) throw fail(404, 'Food item not found.');
  const restaurant = await Restaurant.findOne({ where: { id: item.restaurantId, ...PUBLIC_RESTAURANT }, attributes: ['id', 'slug', 'name'] });
  if (!restaurant) throw fail(404, 'Food item not found.');
  const branches = await Branch.findAll({ where: { restaurantId: restaurant.id, ...PUBLIC_BRANCH } });
  if (!branches.length) throw fail(404, 'Food item not found.');
  selectBranch(branches, req.query.branchId);
  send(res, { id: item.id, name: item.name, description: item.description, price: item.price, discountedPrice: item.discountedPrice, imageUrl: item.imageUrl, foodType: item.foodType, dietaryTags: item.dietaryTags || [], allergenTags: item.allergenTags || [], preparationTime: item.preparationTime, isFeatured: item.isFeatured, category: { id: item.category.id, name: item.category.name }, restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug }, options: item.options.sort((a, b) => a.displayOrder - b.displayOrder) });
});

exports.resolveTableQr = handle(async (req, res) => {
  const { token } = req.params;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw fail(404, 'This table QR code is invalid or unavailable.');
  const table = await RestaurantTable.findOne({
    where: { qrToken: token, isActive: true, occupancyStatus: 'available' },
    include: [
      { model: Restaurant, as: 'restaurant', where: PUBLIC_RESTAURANT, attributes: ['name', 'description', 'logo'], required: true },
      { model: Branch, as: 'branch', where: { ...PUBLIC_BRANCH, dineInEnabled: true }, attributes: ['id', 'restaurantId', 'name', 'addressLine', 'addressLine2', 'landmark', 'city', 'state', 'postalCode', 'country'], required: true },
    ],
  });
  if (!table || table.branch.restaurantId !== table.restaurantId) throw fail(404, 'This table QR code is invalid or unavailable.');
  const categories = await MenuCategory.findAll({
    where: { isActive: true, [Op.or]: [{ scope: 'global', restaurantId: null }, { scope: 'restaurant', restaurantId: table.restaurantId }] },
    attributes: ['name', 'description', 'displayOrder'],
    include: [{ model: MenuItem, as: 'items', where: { restaurantId: table.restaurantId, isAvailable: true, isActive: true, moderationStatus: 'clear' }, required: false, attributes: ['id', 'name', 'description', 'price', 'discountedPrice', 'imageUrl', 'foodType', 'dietaryTags', 'allergenTags', 'displayOrder', 'isAvailable'], include: [{ model: MenuItemOption, as: 'options', where: { restaurantId: table.restaurantId }, required: false, attributes: ['id', 'type', 'name', 'price', 'displayOrder'] }] }],
    order: [['displayOrder', 'ASC'], ['name', 'ASC'], [{ model: MenuItem, as: 'items' }, 'displayOrder', 'ASC'], [{ model: MenuItem, as: 'items' }, 'name', 'ASC']],
  });
  send(res, {
    restaurant: { name: table.restaurant.name, description: table.restaurant.description, logo: table.restaurant.logo },
    branch: { name: table.branch.name, address: [table.branch.addressLine, table.branch.addressLine2, table.branch.landmark, table.branch.city, table.branch.state, table.branch.postalCode, table.branch.country].filter(Boolean).join(', ') },
    table: { number: table.tableNumber },
    categories: categories.map((category) => ({ name: category.name, description: category.description, items: (category.items || []).filter((item) => item.isAvailable).map((item) => ({ id: item.id, name: item.name, description: item.description, price: item.price, discountedPrice: item.discountedPrice, imageUrl: item.imageUrl, foodType: item.foodType, dietaryTags: item.dietaryTags || [], allergenTags: item.allergenTags || [], options: (item.options || []).sort((a, b) => a.displayOrder - b.displayOrder).map((option) => ({ id: option.id, type: option.type, name: option.name, price: option.price })) })) })),
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../src/modules/restaurants/coupon.controller');
const { PlatformFoodCoupon, PlatformFoodCouponRedemption, RestaurantFoodCoupon, RestaurantFoodCouponRedemption } = require('../src/models');
const { validateFoodCoupon } = require('../src/services/food-coupons');
const activeWindow = () => ({ startsAt: new Date(Date.now() - 86400000), expiresAt: new Date(Date.now() + 86400000) });

const validCoupon = (overrides = {}) => ({
  code: 'lunch_10', name: 'Lunch special', description: 'Lunch promotion', discountType: 'percentage', discountValue: 10,
  minimumOrderAmount: 100, maximumDiscount: 75, startsAt: '2026-11-01T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z',
  usageLimit: 50, perCustomerLimit: 2, status: 'active', ...overrides,
});

test('restaurant coupon input normalizes codes and accepts optional limits', () => {
  const input = controller.validateInput(validCoupon({ code: ' lunch_10 ', usageLimit: '', perCustomerLimit: '', maximumDiscount: '' }));
  assert.equal(input.code, 'LUNCH_10');
  assert.equal(input.usageLimit, null);
  assert.equal(input.perCustomerLimit, null);
  assert.equal(input.maximumDiscount, null);
});

test('restaurant coupon input rejects invalid discounts, dates, and usage limits', () => {
  for (const input of [
    validCoupon({ discountValue: 101 }),
    validCoupon({ discountValue: 0 }),
    validCoupon({ minimumOrderAmount: -1 }),
    validCoupon({ maximumDiscount: 0 }),
    validCoupon({ expiresAt: '2026-10-31T23:59:59.000Z' }),
    validCoupon({ perCustomerLimit: 1.5 }),
    validCoupon({ code: 'bad code' }),
  ]) assert.throws(() => controller.validateInput(input), { status: 400 });
});

test('restaurant coupon checkout lookup is constrained to the order restaurant and computes its discount', async (t) => {
  const originalFindOne = RestaurantFoodCoupon.findOne;
  const originalCount = RestaurantFoodCouponRedemption.count;
  let lookup;
  RestaurantFoodCoupon.findOne = async (options) => { lookup = options; return { id: 'coupon-a', restaurantId: 'restaurant-a', status: 'active', ...activeWindow(), minimumOrderAmount: 100, maximumDiscount: 75, discountType: 'percentage', discountValue: 20, usageLimit: 5, perCustomerLimit: 2 }; };
  RestaurantFoodCouponRedemption.count = async () => 0;
  t.after(() => { RestaurantFoodCoupon.findOne = originalFindOne; RestaurantFoodCouponRedemption.count = originalCount; });

  const result = await validateFoodCoupon({ code: 'SAVE20', source: 'restaurant_food', restaurantId: 'restaurant-a', customerId: 'customer-a', priced: [], subtotalCents: 50000, transaction: { LOCK: { UPDATE: 'UPDATE' } } });
  assert.equal(lookup.where.restaurantId, 'restaurant-a');
  assert.equal(result.source, 'restaurant_food');
  assert.equal(result.discountCents, 7500);
});

test('restaurant coupon checkout rejects unavailable codes, minimums, and usage caps', async (t) => {
  const originalFindOne = RestaurantFoodCoupon.findOne;
  const originalCount = RestaurantFoodCouponRedemption.count;
  let count = 0;
  RestaurantFoodCoupon.findOne = async () => ({ id: 'coupon-a', status: 'active', ...activeWindow(), minimumOrderAmount: 100, maximumDiscount: null, discountType: 'fixed', discountValue: 20, usageLimit: 1, perCustomerLimit: null });
  RestaurantFoodCouponRedemption.count = async () => count;
  t.after(() => { RestaurantFoodCoupon.findOne = originalFindOne; RestaurantFoodCouponRedemption.count = originalCount; });
  const common = { code: 'SAVE20', source: 'restaurant_food', restaurantId: 'restaurant-a', customerId: 'customer-a', priced: [], transaction: { LOCK: { UPDATE: 'UPDATE' } } };
  await assert.rejects(validateFoodCoupon({ ...common, subtotalCents: 5000 }), { status: 400, message: /minimum order/i });
  count = 1;
  await assert.rejects(validateFoodCoupon({ ...common, subtotalCents: 50000 }), { status: 400, message: /usage limit/i });
});

test('restaurant coupon lookup cannot resolve a different restaurant’s coupon', async (t) => {
  const originalFindOne = RestaurantFoodCoupon.findOne;
  const originalCount = RestaurantFoodCouponRedemption.count;
  RestaurantFoodCoupon.findOne = async ({ where }) => where.restaurantId === 'restaurant-b' ? { id: 'coupon-b' } : null;
  RestaurantFoodCouponRedemption.count = async () => 0;
  t.after(() => { RestaurantFoodCoupon.findOne = originalFindOne; RestaurantFoodCouponRedemption.count = originalCount; });
  await assert.rejects(validateFoodCoupon({ code: 'B-SPECIAL', source: 'restaurant_food', restaurantId: 'restaurant-a', customerId: 'customer-a', priced: [], subtotalCents: 50000, transaction: { LOCK: { UPDATE: 'UPDATE' } } }), { status: 400, message: /unavailable or expired/i });
});

test('platform food coupon checkout remains supported and preserves item targeting', async (t) => {
  const originalFindOne = PlatformFoodCoupon.findOne;
  const originalCount = PlatformFoodCouponRedemption.count;
  PlatformFoodCoupon.findOne = async ({ where }) => where.code === 'PLATFORM20' ? { id: 'platform-1', status: 'active', ...activeWindow(), minimumOrderAmount: 0, restaurantIds: ['restaurant-a'], categoryIds: ['category-a'], productIds: null, maximumDiscount: null, discountType: 'percentage', discountValue: 20, usageLimit: null, perCustomerLimit: null } : null;
  PlatformFoodCouponRedemption.count = async () => 0;
  t.after(() => { PlatformFoodCoupon.findOne = originalFindOne; PlatformFoodCouponRedemption.count = originalCount; });
  const result = await validateFoodCoupon({ code: 'PLATFORM20', source: 'platform_food', restaurantId: 'restaurant-a', customerId: 'customer-a', priced: [{ item: { id: 'item-a', categoryId: 'category-a' }, lineCents: 10000 }, { item: { id: 'item-b', categoryId: 'category-b' }, lineCents: 5000 }], subtotalCents: 15000, transaction: { LOCK: { UPDATE: 'UPDATE' } } });
  assert.equal(result.discountCents, 2000);
  assert.equal(result.source, 'platform_food');
});

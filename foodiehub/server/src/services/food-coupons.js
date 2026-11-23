const { Op } = require("sequelize");
const {
  PlatformFoodCoupon,
  PlatformFoodCouponRedemption,
  RestaurantFoodCoupon,
  RestaurantFoodCouponRedemption,
} = require("../models");

const cents = (value) => Math.round(Number(value || 0) * 100);
const cash = (value) => Number((value / 100).toFixed(2));
const fail = (status, message) => Object.assign(new Error(message), { status });

async function validateFoodCoupon({
  code,
  source,
  restaurantId,
  customerId,
  priced,
  subtotalCents,
  transaction,
}) {
  if (!["platform_food", "restaurant_food"].includes(source))
    throw fail(400, "Choose whether this is a FoodieHub or restaurant coupon.");
  const Coupon =
    source === "platform_food" ? PlatformFoodCoupon : RestaurantFoodCoupon;
  const Redemption =
    source === "platform_food"
      ? PlatformFoodCouponRedemption
      : RestaurantFoodCouponRedemption;
  const where =
    source === "restaurant_food" ? { code, restaurantId } : { code };
  const coupon = await Coupon.findOne({
    where,
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const now = new Date();
  if (
    !coupon ||
    coupon.status !== "active" ||
    new Date(coupon.startsAt) > now ||
    new Date(coupon.expiresAt) <= now
  )
    throw fail(400, "This coupon is unavailable or expired.");
  if (Number(coupon.minimumOrderAmount) * 100 > subtotalCents)
    throw fail(
      400,
      `This coupon requires a minimum order of ${cash(cents(coupon.minimumOrderAmount))}.`,
    );

  let eligibleCents = subtotalCents;
  if (source === "platform_food") {
    if (
      coupon.restaurantIds?.length &&
      !coupon.restaurantIds.includes(restaurantId)
    )
      throw fail(400, "This coupon is not valid at this restaurant.");
    const matchingLines = priced.filter(
      ({ item }) =>
        (!coupon.categoryIds?.length ||
          coupon.categoryIds.includes(item.categoryId)) &&
        (!coupon.productIds?.length || coupon.productIds.includes(item.id)),
    );
    eligibleCents = matchingLines.reduce(
      (sum, line) => sum + line.lineCents,
      0,
    );
    if (
      (coupon.categoryIds?.length || coupon.productIds?.length) &&
      !eligibleCents
    )
      throw fail(400, "This coupon does not apply to items in your cart.");
  }
  const redemptionWhere =
    source === "restaurant_food"
      ? { couponId: coupon.id, restaurantId, status: { [Op.ne]: "released" } }
      : { couponId: coupon.id, status: { [Op.ne]: "released" } };
  const usedCount = await Redemption.count({
    where: redemptionWhere,
    transaction,
  });
  if (coupon.usageLimit != null && usedCount >= coupon.usageLimit)
    throw fail(400, "This coupon has reached its usage limit.");
  if (coupon.perCustomerLimit != null) {
    const customerUses = await Redemption.count({
      where: { ...redemptionWhere, customerId },
      transaction,
    });
    if (customerUses >= coupon.perCustomerLimit)
      throw fail(
        400,
        "You have reached this coupon’s per-customer usage limit.",
      );
  }
  let discountCents =
    coupon.discountType === "percentage"
      ? Math.round((eligibleCents * Number(coupon.discountValue)) / 100)
      : cents(coupon.discountValue);
  if (coupon.maximumDiscount != null)
    discountCents = Math.min(discountCents, cents(coupon.maximumDiscount));
  discountCents = Math.min(discountCents, Math.max(0, eligibleCents - 1));
  return { coupon, source, discountCents };
}

async function recordCouponReservation(
  couponDetails,
  customerId,
  order,
  transaction,
  status,
) {
  if (!couponDetails?.coupon || !couponDetails.discountCents) return;
  const Redemption =
    couponDetails.source === "restaurant_food"
      ? RestaurantFoodCouponRedemption
      : PlatformFoodCouponRedemption;
  await Redemption.create(
    {
      couponId: couponDetails.coupon.id,
      ...(couponDetails.source === "restaurant_food"
        ? { restaurantId: order.restaurantId }
        : {}),
      customerId,
      orderId: order.id,
      discountAmount: cash(couponDetails.discountCents),
      status,
    },
    { transaction },
  );
}

async function changeOrderCouponStatus(
  orderId,
  status,
  transaction,
  includeRedeemed = false,
) {
  const condition = {
    orderId,
    ...(includeRedeemed
      ? { status: { [Op.ne]: "released" } }
      : { status: "reserved" }),
  };
  await PlatformFoodCouponRedemption.update(
    { status },
    { where: condition, transaction },
  );
  await RestaurantFoodCouponRedemption.update(
    { status },
    { where: condition, transaction },
  );
}

async function reReserveOrderCoupon(order, transaction) {
  const Redemption =
    order.couponSource === "restaurant_food"
      ? RestaurantFoodCouponRedemption
      : PlatformFoodCouponRedemption;
  const redemption = await Redemption.findOne({
    where: { orderId: order.id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!redemption || redemption.status !== "released") return;
  const Coupon =
    order.couponSource === "restaurant_food"
      ? RestaurantFoodCoupon
      : PlatformFoodCoupon;
  const coupon = await Coupon.findByPk(redemption.couponId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!coupon)
    throw fail(
      409,
      "The coupon attached to this order is no longer available for payment retry.",
    );
  const where = { couponId: coupon.id, status: { [Op.ne]: "released" } };
  if (order.couponSource === "restaurant_food")
    where.restaurantId = order.restaurantId;
  const used = await Redemption.count({ where, transaction });
  const customerUsed = await Redemption.count({
    where: { ...where, customerId: order.customerId },
    transaction,
  });
  if (
    (coupon.usageLimit != null && used >= coupon.usageLimit) ||
    (coupon.perCustomerLimit != null && customerUsed >= coupon.perCustomerLimit)
  )
    throw fail(
      409,
      "This coupon has reached its usage limit and cannot be used for a payment retry.",
    );
  await redemption.update({ status: "reserved" }, { transaction });
}

module.exports = {
  validateFoodCoupon,
  recordCouponReservation,
  changeOrderCouponStatus,
  reReserveOrderCoupon,
};

const crypto = require("node:crypto");
const Razorpay = require("razorpay");
const { Op } = require("sequelize");
const {
  Restaurant,
  SubscriptionPlan,
  RestaurantSubscription,
  SubscriptionPayment,
  SubscriptionCoupon,
  SubscriptionCouponRedemption,
} = require("../../models");
const { recordAuditEvent } = require("../../services/audit-log");
const { notifySuperAdmins } = require("../../services/admin-notifications");

const fail = (status, message) => Object.assign(new Error(message), { status });
const send = (res, data, status = 200, message) =>
  res
    .status(status)
    .json({ success: true, ...(message ? { message } : {}), data });
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const configured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const razorpay = () => {
  if (!configured())
    throw fail(
      503,
      "Subscription payments are unavailable because online payment is not configured.",
    );
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};
const cents = (amount) => Math.round(Number(amount || 0) * 100);
const planSnapshot = (plan) => ({
  code: plan.code,
  name: plan.name,
  description: plan.description,
  price: Number(plan.price),
  currency: plan.currency,
  billingPeriod: plan.billingPeriod,
  maxBranches: plan.maxBranches,
  maxEmployees: plan.maxEmployees,
  features: plan.features || [],
});

function addBillingPeriod(start, billingPeriod) {
  const result = new Date(start);
  if (billingPeriod === "yearly") {
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCFullYear(result.getUTCFullYear() + 1);
    const lastDay = new Date(
      Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
  } else {
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + 1);
    const lastDay = new Date(
      Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
    ).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
  }
  return result;
}

exports.plans = handle(async (_req, res) => {
  const plans = await SubscriptionPlan.findAll({
    where: { isActive: true },
    order: [
      ["price", "ASC"],
      ["billingPeriod", "ASC"],
      ["name", "ASC"],
    ],
  });
  send(
    res,
    plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      currency: plan.currency,
      billingPeriod: plan.billingPeriod,
      maxBranches: plan.maxBranches,
      maxEmployees: plan.maxEmployees,
      features: plan.features || [],
    })),
  );
});

exports.current = handle(async (req, res) => {
  const [subscriptions, pendingPayments] = await Promise.all([
    RestaurantSubscription.findAll({
      where: { restaurantId: req.restaurant.id },
      include: [
        {
          model: SubscriptionPlan,
          as: "plan",
          attributes: [
            "id",
            "code",
            "name",
            "price",
            "billingPeriod",
            "maxBranches",
            "maxEmployees",
            "features",
          ],
          required: true,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 10,
    }),
    SubscriptionPayment.findAll({
      where: { restaurantId: req.restaurant.id, status: "pending" },
      include: [
        {
          model: SubscriptionPlan,
          as: "plan",
          attributes: ["id", "name"],
          required: true,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 5,
    }),
  ]);
  const now = new Date();
  const history = subscriptions.map((subscription) => {
    const item = subscription.toJSON();
    if (
      item.status === "active" &&
      item.startDate &&
      new Date(item.startDate) > now
    )
      item.displayStatus = "pending";
    else if (
      item.status === "active" &&
      item.endDate &&
      new Date(item.endDate) <= now
    )
      item.displayStatus = "expired";
    else item.displayStatus = item.status;
    return item;
  });
  send(res, {
    subscriptions: history,
    pendingPayments,
    paymentConfiguration: {
      razorpayConfigured: configured(),
      ...(configured() ? { keyId: process.env.RAZORPAY_KEY_ID } : {}),
    },
  });
});

exports.createCheckout = handle(async (req, res) => {
  const { planId, idempotencyKey } = req.body || {};
  const couponCode =
    typeof req.body?.couponCode === "string"
      ? req.body.couponCode.trim().toUpperCase()
      : "";
  if (typeof planId !== "string" || !UUID.test(planId))
    throw fail(400, "Choose a valid subscription plan.");
  if (typeof idempotencyKey !== "string" || !UUID.test(idempotencyKey))
    throw fail(400, "A valid checkout idempotency key is required.");
  const planPreview = await SubscriptionPlan.findOne({
    where: { id: planId, isActive: true },
    attributes: ["id", "price"],
  });
  if (!planPreview) throw fail(404, "This subscription plan is unavailable.");
  if (Number(planPreview.price) > 0 && !configured())
    throw fail(
      503,
      "Subscription payments are unavailable because online payment is not configured.",
    );
  const result = await Restaurant.sequelize.transaction(async (transaction) => {
    const restaurant = await Restaurant.findByPk(req.restaurant.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!restaurant) throw fail(404, "Restaurant not found.");
    const existingPayment = await SubscriptionPayment.findOne({
      where: { restaurantId: restaurant.id, idempotencyKey },
      include: [
        { model: RestaurantSubscription, as: "subscription", required: true },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (existingPayment) {
      if (existingPayment.planId !== planId)
        throw fail(
          409,
          "This checkout key was already used for another subscription plan.",
        );
      if (existingPayment.status === "paid")
        return {
          free: false,
          payment: existingPayment,
          subscription: existingPayment.subscription,
          repeated: true,
        };
      if (existingPayment.status === "failed")
        throw fail(
          409,
          "This checkout attempt has failed. Start a new checkout with a new idempotency key.",
        );
      if (existingPayment.status === "pending")
        return {
          free: false,
          payment: existingPayment,
          subscription: existingPayment.subscription,
          repeated: true,
        };
      throw fail(
        409,
        "This checkout attempt is no longer available. Start a new checkout with a new idempotency key.",
      );
    }
    const pending = await SubscriptionPayment.findOne({
      where: { restaurantId: restaurant.id, status: "pending" },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (pending)
      throw fail(
        409,
        "A subscription payment is already pending. Finish it or wait for its payment result before starting another checkout.",
      );
    const plan = await SubscriptionPlan.findOne({
      where: { id: planId, isActive: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!plan) throw fail(404, "This subscription plan is unavailable.");
    const now = new Date();
    const prior = await RestaurantSubscription.findOne({
      where: {
        restaurantId: restaurant.id,
        status: "active",
        endDate: { [Op.gt]: now },
      },
      order: [["endDate", "DESC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      Number(plan.price) === 0 &&
      prior?.planId === plan.id &&
      new Date(prior.startDate) <= now
    )
      return { free: true, subscription: prior, repeated: true };
    const startDate =
      prior && new Date(prior.endDate) > now ? new Date(prior.endDate) : now;
    const endDate = addBillingPeriod(startDate, plan.billingPeriod);
    const paymentType = !prior
      ? "initial"
      : prior.planId === plan.id
        ? "renewal"
        : "plan_change";
    let coupon = null;
    let discountCents = 0;
    if (couponCode) {
      if (couponCode.length > 40 || Number(plan.price) <= 0)
        throw fail(
          400,
          "This subscription coupon cannot be applied to the selected plan.",
        );
      coupon = await SubscriptionCoupon.findOne({
        where: { code: couponCode },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (
        !coupon ||
        coupon.status !== "active" ||
        new Date(coupon.startsAt) > now ||
        new Date(coupon.expiresAt) <= now
      )
        throw fail(400, "This subscription coupon is unavailable or expired.");
      const hasSubscriptionHistory = await RestaurantSubscription.count({
        where: { restaurantId: restaurant.id },
        transaction,
      });
      const applies =
        coupon.appliesTo === "all" ||
        (coupon.appliesTo === "first" && hasSubscriptionHistory === 0) ||
        (coupon.appliesTo === "renewal" && paymentType === "renewal");
      if (!applies)
        throw fail(
          400,
          "This coupon does not apply to this subscription purchase.",
        );
      const used = await SubscriptionCouponRedemption.count({
        where: { couponId: coupon.id },
        transaction,
      });
      if (coupon.usageLimit != null && used >= coupon.usageLimit)
        throw fail(
          400,
          "This subscription coupon has reached its usage limit.",
        );
      if (coupon.perRestaurantLimit != null) {
        const restaurantUses = await SubscriptionCouponRedemption.count({
          where: { couponId: coupon.id, restaurantId: restaurant.id },
          transaction,
        });
        if (restaurantUses >= coupon.perRestaurantLimit)
          throw fail(
            400,
            "This restaurant has reached this coupon’s usage limit.",
          );
      }
      discountCents =
        coupon.discountType === "percentage"
          ? Math.round((cents(plan.price) * Number(coupon.discountValue)) / 100)
          : cents(coupon.discountValue);
      if (coupon.maximumDiscount != null)
        discountCents = Math.min(discountCents, cents(coupon.maximumDiscount));
      discountCents = Math.min(
        discountCents,
        Math.max(0, cents(plan.price) - 1),
      );
    }
    const snapshot = planSnapshot(plan);
    const subscription = await RestaurantSubscription.create(
      {
        restaurantId: restaurant.id,
        planId: plan.id,
        planSnapshot: snapshot,
        status: Number(plan.price) === 0 ? "active" : "pending",
        amount: plan.price,
        currency: plan.currency,
        startDate,
        endDate,
        renewalDate: endDate,
      },
      { transaction },
    );
    if (Number(plan.price) === 0) {
      await recordAuditEvent(
        req,
        {
          action: "subscription.free_plan_activated",
          entityType: "restaurant_subscription",
          entityId: subscription.id,
          afterData: {
            restaurantId: restaurant.id,
            planId: plan.id,
            startDate,
            endDate,
          },
        },
        { transaction },
      );
      return { free: true, subscription, repeated: false };
    }
    const payment = await SubscriptionPayment.create(
      {
        subscriptionId: subscription.id,
        restaurantId: restaurant.id,
        planId: plan.id,
        planSnapshot: snapshot,
        amount: (cents(plan.price) - discountCents) / 100,
        currency: plan.currency,
        status: "pending",
        paymentType,
        idempotencyKey,
        periodStartAt: startDate,
        periodEndAt: endDate,
      },
      { transaction },
    );
    if (coupon && discountCents)
      await SubscriptionCouponRedemption.create(
        {
          couponId: coupon.id,
          restaurantId: restaurant.id,
          paymentId: payment.id,
          discountAmount: discountCents / 100,
        },
        { transaction },
      );
    return { free: false, payment, subscription, repeated: false };
  });
  if (result.free)
    return send(
      res,
      {
        subscription: result.subscription,
        free: true,
        repeated: result.repeated,
      },
      result.repeated ? 200 : 201,
      "Free plan activated.",
    );
  if (result.payment.status === "paid")
    return send(
      res,
      {
        subscriptionId: result.subscription.id,
        paymentId: result.payment.id,
        paymentStatus: "paid",
        repeated: true,
      },
      200,
      "This subscription checkout was already paid.",
    );
  if (result.payment.razorpayOrderId)
    return send(res, {
      subscriptionId: result.subscription.id,
      paymentId: result.payment.id,
      razorpayOrderId: result.payment.razorpayOrderId,
      amount: cents(result.payment.amount),
      currency: result.payment.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      repeated: true,
    });
  const client = razorpay();
  const razorpayOrder = await client.orders.create({
    amount: cents(result.payment.amount),
    currency: result.payment.currency,
    receipt: `fhsub_${result.payment.id.replaceAll("-", "").slice(0, 30)}`,
    notes: {
      foodiehubSubscriptionPaymentId: result.payment.id,
      restaurantId: req.restaurant.id,
    },
  });
  await SubscriptionPayment.update(
    { razorpayOrderId: razorpayOrder.id },
    {
      where: {
        id: result.payment.id,
        restaurantId: req.restaurant.id,
        status: "pending",
      },
    },
  );
  send(
    res,
    {
      subscriptionId: result.subscription.id,
      paymentId: result.payment.id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      repeated: false,
    },
    201,
    "Subscription payment order created.",
  );
});

exports.verifyPayment = handle(async (req, res) => {
  const {
    paymentId: localPaymentId,
    razorpay_order_id: gatewayOrderId,
    razorpay_payment_id: gatewayPaymentId,
    razorpay_signature: signature,
  } = req.body || {};
  if (
    ![localPaymentId, gatewayOrderId, gatewayPaymentId, signature].every(
      (value) => typeof value === "string" && value.length > 0,
    )
  )
    throw fail(400, "The Razorpay payment response is incomplete.");
  const payment = await SubscriptionPayment.findOne({
    where: { id: localPaymentId, restaurantId: req.restaurant.id },
    include: [
      { model: RestaurantSubscription, as: "subscription", required: true },
    ],
  });
  if (!payment) throw fail(404, "Subscription payment not found.");
  if (!configured())
    throw fail(
      503,
      "Subscription payments are unavailable because online payment is not configured.",
    );
  if (payment.razorpayOrderId !== gatewayOrderId)
    throw fail(
      400,
      "The Razorpay order does not match this subscription payment.",
    );
  if (!/^[0-9a-f]{64}$/i.test(signature))
    throw fail(400, "Razorpay signature verification failed.");
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${gatewayOrderId}|${gatewayPaymentId}`)
    .digest();
  const received = Buffer.from(signature, "hex");
  if (
    received.length !== expected.length ||
    !crypto.timingSafeEqual(received, expected)
  )
    throw fail(400, "Razorpay signature verification failed.");
  if (
    payment.status === "paid" &&
    payment.razorpayPaymentId === gatewayPaymentId
  )
    return send(
      res,
      {
        paymentId: payment.id,
        paymentStatus: "paid",
        subscription: payment.subscription,
      },
      200,
      "Subscription payment was already verified.",
    );
  if (payment.status !== "pending")
    throw fail(409, "This subscription payment is no longer pending.");
  const gateway = razorpay();
  let providerPayment = await gateway.payments.fetch(gatewayPaymentId);
  if (
    providerPayment.order_id !== gatewayOrderId ||
    Number(providerPayment.amount) !== cents(payment.amount) ||
    providerPayment.currency !== payment.currency
  )
    throw fail(
      409,
      "Razorpay payment details do not match the plan amount and currency.",
    );
  if (providerPayment.status === "authorized")
    providerPayment = await gateway.payments.capture(
      gatewayPaymentId,
      cents(payment.amount),
      payment.currency,
    );
  if (providerPayment.status !== "captured")
    throw fail(
      409,
      "Razorpay has not confirmed a captured subscription payment.",
    );
  const updated = await SubscriptionPayment.sequelize.transaction(
    async (transaction) => {
      const locked = await SubscriptionPayment.findOne({
        where: { id: payment.id, restaurantId: req.restaurant.id },
        include: [
          { model: RestaurantSubscription, as: "subscription", required: true },
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (
        locked.status === "paid" &&
        locked.razorpayPaymentId === gatewayPaymentId
      )
        return locked;
      if (
        locked.status !== "pending" ||
        locked.razorpayOrderId !== gatewayOrderId
      )
        throw fail(
          409,
          "Subscription payment has changed. Refresh the subscription page.",
        );
      await locked.update(
        {
          status: "paid",
          razorpayPaymentId: gatewayPaymentId,
          verifiedAt: new Date(),
          failureReason: null,
        },
        { transaction },
      );
      await locked.subscription.update({ status: "active" }, { transaction });
      req.restaurantRole = "restaurant_owner";
      await recordAuditEvent(
        req,
        {
          action: "subscription.payment_verified",
          entityType: "subscription_payment",
          entityId: locked.id,
          afterData: {
            subscriptionId: locked.subscriptionId,
            restaurantId: locked.restaurantId,
            planId: locked.planId,
            amount: locked.amount,
            razorpayPaymentId: gatewayPaymentId,
          },
        },
        { transaction },
      );
      return locked;
    },
  );
  send(
    res,
    {
      paymentId: updated.id,
      paymentStatus: updated.status,
      subscriptionId: updated.subscriptionId,
    },
    200,
    "Subscription payment verified and the plan activated.",
  );
});

exports.recordPaymentFailure = handle(async (req, res) => {
  const {
    paymentId: localPaymentId,
    razorpayOrderId: gatewayOrderId,
    razorpayPaymentId: gatewayPaymentId,
  } = req.body || {};
  if (
    ![localPaymentId, gatewayOrderId, gatewayPaymentId].every(
      (value) => typeof value === "string" && value.length > 0,
    )
  )
    throw fail(400, "Razorpay failure details are incomplete.");
  const payment = await SubscriptionPayment.findOne({
    where: { id: localPaymentId, restaurantId: req.restaurant.id },
    include: [
      { model: RestaurantSubscription, as: "subscription", required: true },
    ],
  });
  if (!payment) throw fail(404, "Subscription payment not found.");
  if (payment.razorpayOrderId !== gatewayOrderId)
    throw fail(
      400,
      "The failed payment does not match this subscription order.",
    );
  const providerPayment = await razorpay().payments.fetch(gatewayPaymentId);
  if (
    providerPayment.order_id !== gatewayOrderId ||
    providerPayment.status !== "failed"
  )
    throw fail(409, "Razorpay has not confirmed a failed payment.");
  await SubscriptionPayment.sequelize.transaction(async (transaction) => {
    const locked = await SubscriptionPayment.findOne({
      where: { id: payment.id, restaurantId: req.restaurant.id },
      include: [
        { model: RestaurantSubscription, as: "subscription", required: true },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (locked.status === "paid")
      throw fail(
        409,
        "A verified subscription payment cannot be changed to failed.",
      );
    if (locked.status === "failed") return;
    await locked.update(
      {
        status: "failed",
        razorpayPaymentId: gatewayPaymentId,
        failureReason:
          typeof providerPayment.error_description === "string"
            ? providerPayment.error_description.slice(0, 2000)
            : "Razorpay reported that this payment failed.",
      },
      { transaction },
    );
    await locked.subscription.update({ status: "failed" }, { transaction });
    req.restaurantRole = "restaurant_owner";
    await recordAuditEvent(
      req,
      {
        action: "subscription.payment_failed",
        entityType: "subscription_payment",
        entityId: locked.id,
        afterData: {
          subscriptionId: locked.subscriptionId,
          restaurantId: locked.restaurantId,
          failureReason: locked.failureReason,
        },
      },
      { transaction },
    );
  });
  notifySuperAdmins(req, {
    type: "subscription_payment_failure",
    title: "Subscription payment failed",
    message: `A restaurant subscription payment failed (${payment.id}).`,
    entityId: payment.id,
    href: "/admin/subscriptions",
  });
  send(
    res,
    { paymentId: payment.id, paymentStatus: "failed" },
    200,
    "Razorpay confirmed the failed subscription payment.",
  );
});

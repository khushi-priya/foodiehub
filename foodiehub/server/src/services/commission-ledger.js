const { Op } = require("sequelize");
const { CommissionRule, CommissionRecord, Order, OrderRefund } = require("../models");

const cents = (value) => Math.round(Number(value || 0) * 100);
const cash = (value) => Number((value / 100).toFixed(2));

async function applicableRule(order, transaction) {
  const at = order.completedAt || order.updatedAt || new Date();
  const where = {
    status: "active",
    effectiveFrom: { [Op.lte]: at },
    [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gt]: at } }],
  };
  const specific = await CommissionRule.findOne({
    where: { ...where, restaurantId: order.restaurantId },
    order: [["effectiveFrom", "DESC"]],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (specific) return specific;
  return CommissionRule.findOne({
    where: { ...where, restaurantId: null },
    order: [["effectiveFrom", "DESC"]],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
}

async function syncCommissionForOrder(order, transaction) {
  order = await Order.findByPk(order.id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!order) return null;
  const existing = await CommissionRecord.findOne({
    where: { orderId: order.id, recordType: "accrual" },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (["refunded", "partially_refunded"].includes(order.paymentStatus)) {
    if (!existing || existing.status === "reversed") return existing;
    const refundedCents = cents(await OrderRefund.sum("amount", { where: { orderId: order.id, status: "processed" }, transaction }));
    const totalCents = cents(order.total);
    if (refundedCents >= totalCents && existing.status === "pending") {
      await existing.update({ status: "reversed" }, { transaction });
      return existing;
    }
    const adjustment = await CommissionRecord.findOne({
      where: { orderId: order.id, recordType: "refund_adjustment" },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (adjustment) return adjustment;
    const adjustedEligibleCents = refundedCents >= totalCents
      ? cents(existing.eligibleAmount)
      : Math.min(cents(existing.eligibleAmount), Math.round((cents(existing.eligibleAmount) * refundedCents) / totalCents));
    const adjustedCommissionCents = refundedCents >= totalCents
      ? cents(existing.commissionAmount)
      : Math.min(cents(existing.commissionAmount), Math.round((cents(existing.commissionAmount) * refundedCents) / totalCents));
    return CommissionRecord.create(
      {
        orderId: order.id,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
        ruleId: existing.ruleId,
        recordType: "refund_adjustment",
        adjustsRecordId: existing.id,
        eligibleAmount: -cash(adjustedEligibleCents),
        commissionRate: existing.commissionRate,
        commissionAmount: -cash(adjustedCommissionCents),
        restaurantPayable: -cash(adjustedEligibleCents - adjustedCommissionCents),
        status: "pending",
        transactionAt: new Date(),
      },
      { transaction },
    );
  }
  if (
    existing ||
    order.status !== "completed" ||
    order.paymentStatus !== "paid"
  )
    return existing;
  const rule = await applicableRule(order, transaction);
  if (!rule) return null;
  // Commission applies to food subtotal after discounts. Tax, packaging, delivery and gateway fees are excluded.
  const eligibleCents = Math.max(
    0,
    cents(order.subtotal) - cents(order.discount),
  );
  if (!eligibleCents) return null;
  const commissionCents = Math.min(
    eligibleCents,
    Math.round((eligibleCents * Number(rule.commissionRate)) / 100),
  );
  return CommissionRecord.create(
    {
      orderId: order.id,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      ruleId: rule.id,
      recordType: "accrual",
      eligibleAmount: cash(eligibleCents),
      commissionRate: rule.commissionRate,
      commissionAmount: cash(commissionCents),
      restaurantPayable: cash(eligibleCents - commissionCents),
      status: "pending",
      transactionAt: order.completedAt || new Date(),
    },
    { transaction },
  );
}

module.exports = { syncCommissionForOrder, cents, cash };

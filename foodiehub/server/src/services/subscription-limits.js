const { Op } = require("sequelize");
const {
  RestaurantSubscription,
  RestaurantMember,
  Role,
  Branch,
} = require("../models");

const fail = (status, message) => Object.assign(new Error(message), { status });

async function currentSubscription(restaurantId, transaction) {
  const now = new Date();
  return RestaurantSubscription.findOne({
    where: {
      restaurantId,
      status: "active",
      startDate: { [Op.lte]: now },
      endDate: { [Op.gt]: now },
    },
    include: [{ association: "plan" }],
    order: [
      ["startDate", "DESC"],
      ["createdAt", "DESC"],
    ],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
}

async function assertBranchCapacity(restaurantId, transaction, currentCount) {
  const subscription = await currentSubscription(restaurantId, transaction);
  const branchLimit =
    subscription?.planSnapshot &&
    Object.hasOwn(subscription.planSnapshot, "maxBranches")
      ? subscription.planSnapshot.maxBranches
      : subscription?.plan?.maxBranches;
  if (!subscription || branchLimit == null) return subscription;
  const count =
    currentCount ??
    (await Branch.count({ where: { restaurantId }, transaction }));
  if (count >= branchLimit)
    throw fail(
      409,
      `Your ${subscription.plan.name} plan allows up to ${branchLimit} branches. Upgrade your plan to add another branch.`,
    );
  return subscription;
}

async function assertEmployeeCapacity(restaurantId, transaction, currentCount) {
  const subscription = await currentSubscription(restaurantId, transaction);
  const employeeLimit =
    subscription?.planSnapshot &&
    Object.hasOwn(subscription.planSnapshot, "maxEmployees")
      ? subscription.planSnapshot.maxEmployees
      : subscription?.plan?.maxEmployees;
  if (!subscription || employeeLimit == null) return subscription;
  const count =
    currentCount ??
    (await RestaurantMember.count({
      where: { restaurantId, status: { [Op.in]: ["invited", "active"] } },
      include: [
        {
          model: Role,
          as: "role",
          where: { code: { [Op.ne]: "restaurant_owner" }, scope: "restaurant" },
          attributes: [],
          required: true,
        },
      ],
      transaction,
    }));
  if (count >= employeeLimit)
    throw fail(
      409,
      `Your ${subscription.plan.name} plan allows up to ${employeeLimit} employees. Upgrade your plan to add another employee.`,
    );
  return subscription;
}

module.exports = {
  currentSubscription,
  assertBranchCapacity,
  assertEmployeeCapacity,
};

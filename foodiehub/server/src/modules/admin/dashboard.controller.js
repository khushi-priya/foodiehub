const { Op, fn, col } = require('sequelize');
const { Restaurant, Branch, User, Role, Order } = require('../../models');

const send = (res, data) => res.status(200).json({ success: true, data });
exports.overview = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const monthExpression = fn('DATE_FORMAT', col('created_at'), '%Y-%m');

    const [
      totalRestaurants,
      publishedRestaurants,
      pendingRestaurants,
      totalBranches,
      totalCustomers,
      totalOrders,
      ordersToday,
      paidOrders,
      paidOrderValue,
      revenueRows,
      recentOrders,
      recentRestaurants,
    ] = await Promise.all([
      Restaurant.count(),
      Restaurant.count({ where: { approvalStatus: 'approved', listingStatus: 'published', marketplaceEnabled: true } }),
      Restaurant.count({ where: { approvalStatus: 'pending' } }),
      Branch.count(),
      User.count({
        distinct: true,
        col: 'id',
        include: [{ model: Role, as: 'roles', where: { code: 'customer', scope: 'platform' }, attributes: [], through: { attributes: [] }, required: true }],
      }),
      Order.count(),
      Order.count({ where: { createdAt: { [Op.gte]: todayStart, [Op.lt]: tomorrowStart } } }),
      Order.count({ where: { paymentStatus: 'paid' } }),
      Order.sum('total', { where: { paymentStatus: 'paid' } }),
      Order.findAll({
        attributes: [[monthExpression, 'month'], [fn('SUM', col('total')), 'paidOrderValue']],
        where: { paymentStatus: 'paid', createdAt: { [Op.gte]: periodStart, [Op.lt]: periodEnd } },
        group: [monthExpression],
        order: [[monthExpression, 'ASC']],
        raw: true,
      }),
      Order.findAll({
        attributes: ['id', 'orderNumber', 'status', 'paymentStatus', 'total', 'createdAt'],
        include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'], required: false }],
        order: [['createdAt', 'DESC']],
        limit: 6,
      }),
      Restaurant.findAll({
        attributes: ['id', 'name', 'approvalStatus', 'listingStatus', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit: 4,
      }),
    ]);

    const revenueByMonth = new Map(revenueRows.map((row) => [row.month, Number(row.paidOrderValue || 0)]));
    const months = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      months.push({ month: key, label: date.toLocaleString('en', { month: 'short', timeZone: 'UTC' }), paidOrderValue: revenueByMonth.get(key) || 0 });
    }

    const activity = [
      ...recentOrders.map((order) => ({
        id: `order:${order.id}`,
        type: 'order',
        title: `Order ${order.orderNumber}`,
        detail: `${order.restaurant?.name || 'Restaurant'} · ${order.status} · ${order.paymentStatus}`,
        amount: Number(order.total || 0),
        createdAt: order.createdAt,
      })),
      ...recentRestaurants.map((restaurant) => ({
        id: `restaurant:${restaurant.id}`,
        type: 'restaurant',
        title: `${restaurant.name} registered`,
        detail: `${restaurant.approvalStatus} · ${restaurant.listingStatus}`,
        createdAt: restaurant.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);

    return send(res, {
      generatedAt: now.toISOString(),
      timeZone: 'UTC',
      metrics: {
        totalRestaurants,
        publishedRestaurants,
        pendingRestaurants,
        totalBranches,
        totalCustomers,
        totalOrders,
        ordersToday,
        paidOrders,
        paidOrderValue: Number(paidOrderValue || 0),
      },
      paidOrderValueByMonth: months,
      recentActivity: activity,
    });
  } catch (error) {
    return next(error);
  }
};

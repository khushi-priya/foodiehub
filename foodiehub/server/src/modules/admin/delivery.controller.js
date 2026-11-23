'use strict';

const { Op } = require('sequelize');
const {
  DeliveryAssignment, DeliveryStatusHistory, Order, Branch, Restaurant,
  RestaurantMember, User,
} = require('../../models');

const statuses = ['pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer', 'delivered', 'failed', 'cancelled', 'rejected', 'timed_out', 'reassigned'];

exports.assignments = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const where = {};
    if (req.query.branchId) where.branchId = req.query.branchId;
    if (req.query.employeeId) where.restaurantMemberId = req.query.employeeId;
    if (req.query.status) {
      if (!statuses.includes(req.query.status)) return res.status(400).json({ success: false, message: 'Invalid delivery assignment status.' });
      where.status = req.query.status;
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    if (search) {
      const pattern = `%${search}%`;
      const [matchingOrders, matchingEmployeesByName, matchingEmployeesByCode] = await Promise.all([
        Order.findAll({ where: { orderType: 'delivery', orderNumber: { [Op.like]: pattern } }, attributes: ['id'], raw: true }),
        RestaurantMember.findAll({ attributes: ['id'], include: [{ model: User, as: 'user', attributes: [], required: true, where: { [Op.or]: ['firstName', 'lastName', 'phone'].map((field) => ({ [field]: { [Op.like]: pattern } })) } }] }),
        RestaurantMember.findAll({ where: { employeeId: { [Op.like]: pattern } }, attributes: ['id'], raw: true }),
      ]);
      where[Op.or] = [
        { orderId: { [Op.in]: matchingOrders.map((order) => order.id) } },
        { restaurantMemberId: { [Op.in]: [...new Set([...matchingEmployeesByName, ...matchingEmployeesByCode].map((member) => member.id))] } },
      ];
    }
    const [result, branchRows] = await Promise.all([
      DeliveryAssignment.findAndCountAll({
        where,
        attributes: ['id', 'orderId', 'restaurantId', 'branchId', 'restaurantMemberId', 'status', 'assignedAt', 'acceptedAt', 'completedAt', 'notes'],
        include: [
          { model: Order, as: 'order', where: { orderType: 'delivery' }, attributes: ['orderNumber', 'customerName', 'total', 'status'], required: true },
          { model: Branch, as: 'branch', attributes: ['name'], include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'], required: true }], required: true },
          { model: RestaurantMember, as: 'deliveryEmployee', attributes: ['id'], include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'], required: true }], required: true },
        ],
        order: [['assignedAt', 'DESC'], ['createdAt', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        distinct: true,
      }),
      Branch.findAll({ where: { isActive: true }, attributes: ['id', 'name'], include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'], required: true }], order: [[{ model: Restaurant, as: 'restaurant' }, 'name', 'ASC'], ['name', 'ASC']], limit: 3000 }),
    ]);
    const ids = result.rows.map((row) => row.id);
    const events = ids.length ? await DeliveryStatusHistory.findAll({ where: { assignmentId: { [Op.in]: ids }, event: { [Op.in]: ['picked_up', 'delivered'] } }, attributes: ['assignmentId', 'event', 'createdAt'], order: [['createdAt', 'ASC']] }) : [];
    const transitions = new Map();
    for (const event of events) {
      const times = transitions.get(event.assignmentId) || {};
      if (event.event === 'picked_up' && !times.pickedUpAt) times.pickedUpAt = event.createdAt;
      if (event.event === 'delivered' && !times.deliveredAt) times.deliveredAt = event.createdAt;
      transitions.set(event.assignmentId, times);
    }
    res.json({
      success: true,
      assignments: result.rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.order.orderNumber,
        customerName: row.order.customerName,
        total: row.order.total,
        orderStatus: row.order.status,
        restaurantId: row.restaurantId,
        restaurant: row.branch.restaurant.name,
        branchId: row.branchId,
        branch: row.branch.name,
        employeeId: row.restaurantMemberId,
        employee: [row.deliveryEmployee.user.firstName, row.deliveryEmployee.user.lastName].filter(Boolean).join(' '),
        status: row.status,
        assignedAt: row.assignedAt,
        acceptedAt: row.acceptedAt,
        pickedUpAt: transitions.get(row.id)?.pickedUpAt || null,
        deliveredAt: transitions.get(row.id)?.deliveredAt || null,
        completedAt: row.completedAt,
        notes: row.notes,
      })),
      branches: branchRows.map((branch) => ({ id: branch.id, name: branch.name, restaurantName: branch.restaurant.name })),
      pagination: { page, pageSize, total: result.count, totalPages: Math.ceil(result.count / pageSize) },
    });
  } catch (error) {
    next(error);
  }
};

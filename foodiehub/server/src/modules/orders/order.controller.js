const { Op, fn, col, literal } = require('sequelize');
const sequelize = require('../../config/database');
const { Order, OrderItem, OrderRefund, Branch, RestaurantTable, MenuItem, User, DeliveryAssignment, DeliveryStatusHistory, RestaurantMember, DeliveryLocation, KitchenStatusHistory } = require('../../models');
const { refreshAfterOrder, emitFloorEvent } = require('../../services/table-operations');
const { syncCommissionForOrder } = require('../../services/commission-ledger');
const { changeOrderCouponStatus } = require('../../services/food-coupons');
const { deductRecipeStockForOrder } = require('../../services/inventory-stock');
const { createCustomerNotification } = require('../../services/customer-notifications');
const { createRestaurantNotification } = require('../../services/restaurant-notifications');
const { recordAuditEvent } = require('../../services/audit-log');
const { assertOrderTransition, assertKitchenTransition } = require('../../services/order-workflow');

const VALID_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'preparing',
  'ready',
  'completed',
  'cancelled',
];
const ORDER_QUERY_STATUSES = [...VALID_STATUSES, 'picked_up', 'out_for_delivery'];

const sendError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const getRestaurantId = (req) =>
  req.restaurantMembership.restaurantId;
async function canAccessOrder(req, order) {
  if (req.restaurantBranchIds !== null && !req.restaurantBranchIds?.includes(order.branchId)) return false;
  if (req.restaurantMembership?.role?.code === 'waiter') {
    if (!order.tableId) return false;
    return Boolean(await RestaurantTable.findOne({ where: { id: order.tableId, assignedWaiterMemberId: req.restaurantMembership.id }, attributes: ['id'] }));
  }
  return true;
}

// GET /api/v1/restaurant/orders/stats
exports.getOrderStats = async (req, res, next) => {
  try {
    const restaurantId = getRestaurantId(req);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [
      totalOrders,
      pendingOrders,
      preparingOrders,
      readyOrders,
      completedOrders,
      todayOrders,
      todaySales,
    ] = await Promise.all([
      Order.count({ where: { restaurantId } }),

      Order.count({
        where: { restaurantId, status: 'pending' },
      }),

      Order.count({
        where: { restaurantId, status: 'preparing' },
      }),

      Order.count({
        where: { restaurantId, status: 'ready' },
      }),

      Order.count({
        where: { restaurantId, status: 'completed' },
      }),

      Order.count({
        where: {
          restaurantId,
          createdAt: {
            [Op.gte]: todayStart,
            [Op.lt]: tomorrowStart,
          },
        },
      }),

      Order.sum('total', {
        where: {
          restaurantId,
          status: {
            [Op.notIn]: ['rejected', 'cancelled'],
          },
          paymentStatus: 'paid',
          createdAt: {
            [Op.gte]: todayStart,
            [Op.lt]: tomorrowStart,
          },
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalOrders,
        pendingOrders,
        preparingOrders,
        readyOrders,
        completedOrders,
        todayOrders,
        todaySales: Number(todaySales || 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/restaurant/orders
exports.getOrders = async (req, res, next) => {
  try {
    const restaurantId = getRestaurantId(req);

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100
    );

    const offset = (page - 1) * limit;

    const where = { restaurantId };
    if (req.restaurantBranchIds !== null) {
      if (req.query.branchId && !req.restaurantBranchIds.includes(req.query.branchId)) {
        throw sendError('You do not have access to this branch.', 403);
      }
      where.branchId = { [Op.in]: req.restaurantBranchIds };
    } else if (req.query.branchId) where.branchId = req.query.branchId;

    if (req.restaurantMembership.role.code === 'waiter') {
      const assignedTables = await RestaurantTable.findAll({ where: { restaurantId, assignedWaiterMemberId: req.restaurantMembership.id }, attributes: ['id'], raw: true });
      where.tableId = { [Op.in]: assignedTables.map((table) => table.id) };
    }

    if (
      req.query.status &&
      ORDER_QUERY_STATUSES.includes(req.query.status)
    ) {
      where.status = req.query.status;
    }

    if (req.query.search && req.query.search.trim()) {
      const search = `%${req.query.search.trim()}%`;

      where[Op.or] = [
        { orderNumber: { [Op.like]: search } },
        { customerName: { [Op.like]: search } },
        { customerPhone: { [Op.like]: search } },
      ];
    }

    if (req.query.from || req.query.to) {
      where.createdAt = {};

      if (req.query.from) {
        const fromDate = new Date(req.query.from);

        if (Number.isNaN(fromDate.getTime())) {
          throw sendError('Invalid from date.');
        }

        fromDate.setHours(0, 0, 0, 0);
        where.createdAt[Op.gte] = fromDate;
      }

      if (req.query.to) {
        const toDate = new Date(req.query.to);

        if (Number.isNaN(toDate.getTime())) {
          throw sendError('Invalid to date.');
        }

        toDate.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = toDate;
      }
    }

    const countWhere = { ...where };
    delete countWhere.status;
    const [{ count, rows }, groupedCounts] = await Promise.all([
      Order.findAndCountAll({
      where,
      attributes: [
        'id',
        'orderNumber',
        'orderType',
        'tableId',
        'customerName',
        'customerPhone',
        'status',
        'kitchenStatus',
        'paymentStatus',
        'paymentMethod',
        'total',
        'subtotal',
        'tax',
        'packagingFee',
        'deliveryFee',
        'discount',
        'customerNotes',
        'deliveryAddress',
        'createdAt',
      ],
      include: [
        {
          model: OrderItem,
          as: 'items',
          attributes: [
            'id',
            'itemName',
            'variantName',
            'addonsSnapshot',
            'quantity',
            'unitPrice',
            'lineTotal',
            'itemNotes',
          ],
          include: [{ model: MenuItem, as: 'menuItem', attributes: ['imageUrl'], required: false }],
        },
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'city'], required: false },
        { model: RestaurantTable, as: 'table', attributes: ['tableNumber'], required: false },
        { model: OrderRefund, as: 'refund', attributes: ['id', 'amount', 'reason', 'status', 'providerStatus', 'razorpayRefundId', 'createdAt', 'processedAt'], required: false },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true,
      }),
      Order.count({ where: countWhere, group: ['status'] }),
    ]);
    const statusCounts = Object.fromEntries(groupedCounts.map((entry) => [entry.status, Number(entry.count)]));

    const grantedPermissions = new Set(req.restaurantGrantedPermissions || []);
    const canViewDeliveryAssignment = req.restaurantMembership?.role?.code === 'restaurant_owner'
      || grantedPermissions.has('delivery_assignments.view')
      || grantedPermissions.has('delivery_assignments.create')
      || grantedPermissions.has('delivery_assignments.reassign')
      || grantedPermissions.has('delivery_orders.view');
    if (canViewDeliveryAssignment) {
      const deliveryOrders = rows.filter((order) => order.orderType === 'delivery');
      const orderIds = deliveryOrders.map((order) => order.id);
      if (orderIds.length) {
        const assignments = await DeliveryAssignment.findAll({
          where: { restaurantId, orderId: { [Op.in]: orderIds } },
          include: [{
            model: RestaurantMember,
            as: 'deliveryEmployee',
            attributes: ['id', 'employeeId', 'availabilityStatus'],
            where: { restaurantId },
            required: true,
            include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'phone'], required: true }],
          }],
          order: [['createdAt', 'DESC']],
        });
        const latestByOrder = new Map();
        for (const assignment of assignments) {
          const current = latestByOrder.get(assignment.orderId);
          const activeStatuses = ['pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer'];
          if (current && (!activeStatuses.includes(assignment.status) || activeStatuses.includes(current.status))) continue;
          const employee = assignment.deliveryEmployee;
          latestByOrder.set(assignment.orderId, {
            id: assignment.id,
            status: assignment.status,
            assignedAt: assignment.assignedAt,
            acceptedAt: assignment.acceptedAt,
            completedAt: assignment.completedAt,
            notes: assignment.notes,
            employee: {
              id: employee.id,
              employeeId: employee.employeeId,
              fullName: [employee.user.firstName, employee.user.lastName].filter(Boolean).join(' '),
              phone: employee.user.phone,
              availabilityStatus: employee.availabilityStatus,
            },
          });
        }
        for (const order of deliveryOrders) order.setDataValue('deliveryAssignment', latestByOrder.get(order.id) || null);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        orders: rows,
        statusCounts,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.confirmKitchenHandover = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const permissions = new Set(req.restaurantGrantedPermissions || []);
    if (!["orders.manage", "orders.manage_status", "delivery_assignments.update"].some((permission) => permissions.has(permission))) throw sendError('Your role cannot confirm restaurant handover.', 403);
    const order = await Order.findOne({ where: { id: req.params.orderId, restaurantId: getRestaurantId(req), orderType: 'delivery' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order || !(await canAccessOrder(req, order))) throw sendError('Order not found.', 404);
    if (order.status !== 'ready' || order.kitchenStatus !== 'ready') throw sendError('The kitchen must mark this order ready before restaurant handover.', 409);
    assertKitchenTransition(order.kitchenStatus, 'handed_over');
    const assignment = await DeliveryAssignment.findOne({ where: { orderId: order.id, restaurantId: order.restaurantId, status: 'at_restaurant' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!assignment) throw sendError('The assigned delivery associate must confirm arrival at the restaurant first.', 409);
    const existing = await KitchenStatusHistory.findOne({ where: { orderId: order.id, toStatus: 'handed_over' }, transaction, lock: transaction.LOCK.UPDATE });
    if (existing) throw sendError('Restaurant handover has already been confirmed.', 409);
    await order.update({ kitchenStatus: 'handed_over' }, { transaction });
    await KitchenStatusHistory.create({ restaurantId: order.restaurantId, branchId: order.branchId, orderId: order.id, fromStatus: 'ready', toStatus: 'handed_over', performedByUserId: req.authUser.id }, { transaction });
    await DeliveryStatusHistory.create({ restaurantId: order.restaurantId, branchId: assignment.branchId, orderId: order.id, assignmentId: assignment.id, restaurantMemberId: assignment.restaurantMemberId, performedByUserId: req.authUser.id, event: 'restaurant_handover_confirmed', fromStatus: 'at_restaurant', toStatus: 'at_restaurant' }, { transaction });
    await transaction.commit();
    const io = req.app.get('io');
    if (io) io.to(`delivery-employee:${order.restaurantId}:${assignment.restaurantMemberId}`).emit('delivery:assignment-updated', { orderId: order.id, assignmentId: assignment.id, status: assignment.status, kitchenStatus: 'handed_over' });
    return res.json({ success: true, message: 'Restaurant handover confirmed.', data: { orderId: order.id, kitchenStatus: 'handed_over', assignmentId: assignment.id } });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); next(error); }
};

// GET /api/v1/restaurant/orders/:orderId
exports.getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: {
        id: req.params.orderId,
        restaurantId: getRestaurantId(req),
      },
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: MenuItem, as: 'menuItem', attributes: ['imageUrl'], required: false }],
        },
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'city'], required: false },
        { model: RestaurantTable, as: 'table', attributes: ['tableNumber'], required: false },
        { model: OrderRefund, as: 'refund', attributes: ['id', 'amount', 'reason', 'status', 'providerStatus', 'razorpayRefundId', 'createdAt', 'processedAt'], required: false },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    if (!(await canAccessOrder(req, order))) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    order.setDataValue('deliveryOtpHash', undefined);

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/restaurant/orders/:orderId/status
exports.updateOrderStatus = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  const deliveryEvents = [];

  try {
    const { status, restaurantNotes } = req.body || {};
    const roleCode = req.restaurantMembership?.role?.code;
    const grants = new Set(req.restaurantGrantedPermissions || []);
    const canManageOrders = grants.has('orders.manage') || grants.has('orders.manage_status');
    const canUpdateKitchen = roleCode === 'kitchen_staff' && (grants.has('orders.kitchen') || grants.has('kitchen.update_status'));

    if (!VALID_STATUSES.includes(status)) {
      throw sendError('Please provide a valid order status.');
    }

    if (['cancelled', 'rejected'].includes(status) && !req.restaurantGrantedPermissions?.includes('orders.cancel')) {
      throw sendError('You do not have permission to cancel or reject orders.', 403);
    }

    if (roleCode === 'kitchen_staff' && !['preparing', 'ready'].includes(status)) throw sendError('Kitchen staff can only start preparation or mark an order ready.', 403);
    if (status === 'accepted' && !canManageOrders) throw sendError('Restaurant order management permission is required to accept an order.', 403);
    if (['preparing', 'ready'].includes(status) && !canManageOrders && !canUpdateKitchen) throw sendError('Kitchen preparation permission is required to update this order.', 403);
    if (status === 'completed' && !canManageOrders && roleCode !== 'waiter') {
      throw sendError('Only authorized restaurant staff can complete serving workflows.', 403);
    }
    if (roleCode === 'waiter' && status !== 'completed') {
      throw sendError('Waiters can only mark ready orders as served.', 403);
    }

    const order = await Order.findOne({
      where: {
        id: req.params.orderId,
        restaurantId: getRestaurantId(req),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!order) {
      await transaction.rollback();

      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    if (!(await canAccessOrder(req, order))) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    assertOrderTransition(order, status);
    if (status === 'accepted') assertKitchenTransition(order.kitchenStatus, 'queued');
    if (status === 'preparing') assertKitchenTransition(order.kitchenStatus, 'preparing');
    if (status === 'ready') assertKitchenTransition(order.kitchenStatus, 'ready');

    if (status === 'accepted' && order.paymentMethod === 'razorpay' && order.paymentStatus !== 'paid') {
      throw sendError('This Razorpay order cannot be accepted until payment is verified.');
    }

    const updateData = { status };

    if (typeof restaurantNotes === 'string') {
      updateData.restaurantNotes =
        restaurantNotes.trim().slice(0, 5000) || null;
    }

    if (status === 'accepted') {
      updateData.acceptedAt = new Date();
      updateData.kitchenStatus = 'queued';
    }

    if (status === 'preparing') updateData.kitchenStatus = 'preparing';
    if (status === 'ready') updateData.kitchenStatus = 'ready';

    if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    if (status === 'cancelled' || status === 'rejected') {
      updateData.cancelledAt = new Date();
    }

    if (status === 'preparing') {
      await deductRecipeStockForOrder(order, transaction, req.authUser.id);
    }
    const previousOrderStatus = order.status;
    const previousKitchenStatus = order.kitchenStatus;
    await order.update(updateData, { transaction });
    await recordAuditEvent(req, { action: 'order.status_changed', entityType: 'order', entityId: order.id, beforeData: { status: previousOrderStatus, kitchenStatus: previousKitchenStatus }, afterData: { status, kitchenStatus: order.kitchenStatus }, reason: typeof restaurantNotes === 'string' ? restaurantNotes.trim().slice(0, 1000) : null }, { transaction });
    if (['accepted', 'preparing', 'ready'].includes(status) && order.branchId) {
      const fromKitchenStatus = status === 'accepted' ? null : status === 'preparing' ? 'queued' : 'preparing';
      await KitchenStatusHistory.create({ restaurantId: order.restaurantId, branchId: order.branchId, orderId: order.id, fromStatus: fromKitchenStatus, toStatus: updateData.kitchenStatus, performedByUserId: req.authUser.id }, { transaction });
    }
    if (order.customerId) {
      const labels = { accepted: 'Order accepted', preparing: 'Preparation started', ready: 'Order ready', completed: 'Order completed', cancelled: 'Order cancelled', rejected: 'Order declined' };
      await createCustomerNotification({ app: req.app, customerId: order.customerId, category: 'orders', title: labels[status] || 'Order updated', message: `${order.orderNumber} is now ${status.replaceAll('_', ' ')}.`, href: `/customer/orders/${order.id}`, entityId: order.id, dedupeKey: `order-status:${order.id}:${status}`, transaction });
    }
    if (['accepted', 'preparing', 'ready', 'cancelled', 'rejected'].includes(status)) await createRestaurantNotification({ app: req.app, restaurantId: order.restaurantId, branchId: order.branchId, category: ['preparing', 'ready'].includes(status) ? 'kitchen' : 'orders', title: status === 'ready' ? 'Order ready in kitchen' : status === 'preparing' ? 'Kitchen started preparing an order' : `Order ${status}`, message: `Order ${order.orderNumber} is ${status.replaceAll('_', ' ')}.`, href: `${status === 'preparing' || status === 'ready' ? '/restaurant/kitchen' : '/restaurant/orders'}?search=${encodeURIComponent(order.orderNumber)}`, entityId: order.id, dedupeKey: `order-status:${order.id}:${status}`, transaction });
    if (['cancelled', 'rejected'].includes(status) && order.orderType === 'delivery') {
      const assignments = await DeliveryAssignment.findAll({ where: { orderId: order.id, restaurantId: order.restaurantId, status: { [Op.in]: ['pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer'] } }, transaction, lock: transaction.LOCK.UPDATE });
      for (const assignment of assignments) {
        const previousStatus = assignment.status;
        await DeliveryLocation.destroy({ where: { assignmentId: assignment.id }, transaction });
        await assignment.update({ status: 'cancelled', notes: `Order ${status} by restaurant staff.` }, { transaction });
        await DeliveryStatusHistory.create({ restaurantId: order.restaurantId, branchId: assignment.branchId, orderId: order.id, assignmentId: assignment.id, restaurantMemberId: assignment.restaurantMemberId, performedByUserId: req.authUser.id, event: 'cancelled', fromStatus: previousStatus, toStatus: 'cancelled', notes: `Order ${status} by restaurant staff.` }, { transaction });
        const remaining = await DeliveryAssignment.count({ where: { restaurantId: order.restaurantId, restaurantMemberId: assignment.restaurantMemberId, status: { [Op.in]: ['pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer'] } }, transaction });
        await RestaurantMember.update({ availabilityStatus: remaining ? 'on_delivery' : 'available' }, { where: { id: assignment.restaurantMemberId, restaurantId: order.restaurantId }, transaction });
        deliveryEvents.push({ branchId: assignment.branchId, assignmentId: assignment.id, restaurantMemberId: assignment.restaurantMemberId });
      }
    }
    await syncCommissionForOrder(order, transaction);
    if (status === 'cancelled' || status === 'rejected') await changeOrderCouponStatus(order.id, 'released', transaction, true);
    const updatedTable = await refreshAfterOrder(order, transaction);

    await transaction.commit();
    const io = req.app.get('io');
    if (io && status === 'ready' && order.orderType === 'delivery') {
      const assignments = await DeliveryAssignment.findAll({ where: { orderId: order.id, restaurantId: order.restaurantId, status: { [Op.in]: ['pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant'] } }, attributes: ['id', 'restaurantMemberId', 'status'] });
      for (const assignment of assignments) io.to(`delivery-employee:${order.restaurantId}:${assignment.restaurantMemberId}`).emit('delivery:assignment-updated', { orderId: order.id, assignmentId: assignment.id, status: assignment.status, orderStatus: 'ready', kitchenStatus: 'ready' });
    }
    if (io) for (const event of deliveryEvents) {
      io.to(`delivery:${order.restaurantId}:${event.branchId}`).emit('delivery:assignment-updated', { orderId: order.id, assignmentId: event.assignmentId, status: 'cancelled' });
      io.to(`delivery-employee:${order.restaurantId}:${event.restaurantMemberId}`).emit('delivery:assignment-updated', { orderId: order.id, assignmentId: event.assignmentId, status: 'cancelled' });
    }
    if (io && order.customerId) io.to(`customer:${order.customerId}`).emit('delivery:customer-updated', { orderId: order.id, status, kitchenStatus: order.kitchenStatus });

    const updatedOrder = await Order.findOne({
      where: {
        id: order.id,
        restaurantId: getRestaurantId(req),
      },
      include: [
        {
          model: OrderItem,
          as: 'items',
          include: [{ model: MenuItem, as: 'menuItem', attributes: ['imageUrl'], required: false }],
        },
        { model: Branch, as: 'branch', attributes: ['id', 'name', 'city'], required: false },
        { model: RestaurantTable, as: 'table', attributes: ['tableNumber'], required: false },
      ],
    });

    if (order.tableId) {
      emitFloorEvent(req, order.branchId, 'floor:order-updated', { orderId: order.id, tableId: order.tableId, orderStatus: status, occupancyStatus: updatedTable?.occupancyStatus });
    }

    return res.status(200).json({
      success: true,
      message: `Order ${status} successfully.`,
      data: updatedOrder,
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    next(error);
  }
};

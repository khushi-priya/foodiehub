const { Op } = require('sequelize');
const { DeliveryAssignment, DeliveryLocation, DeliverySetting } = require('../../models');

const fail = (status, message) => Object.assign(new Error(message), { status });
const activeStatuses = ['accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer'];

async function sharingEnabled(restaurantId, branchId) {
  const setting = await DeliverySetting.findOne({ where: { restaurantId, branchId } }) || await DeliverySetting.findOne({ where: { restaurantId, branchId: null } });
  return Boolean(setting?.locationSharingEnabled);
}

exports.updateLocation = async (req, res, next) => {
  try {
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const accuracyMeters = req.body?.accuracyMeters == null ? null : Number(req.body.accuracyMeters);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw fail(400, 'Provide valid latitude and longitude coordinates.');
    if (accuracyMeters !== null && (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 100000)) throw fail(400, 'Location accuracy is invalid.');
    const member = req.restaurantMembership;
    if (!member || !['active'].includes(member.status) || !['available', 'on_delivery'].includes(member.availabilityStatus)) throw fail(409, 'Go online before sharing your location.');
    const assignments = await DeliveryAssignment.findAll({ where: { restaurantId: req.restaurant.id, restaurantMemberId: member.id, status: { [Op.in]: activeStatuses } }, order: [['assignedAt', 'DESC']] });
    if (!assignments.length) throw fail(409, 'Location sharing is available only while you have an active delivery assignment.');
    if (req.restaurantBranchIds !== null && assignments.some((assignment) => !req.restaurantBranchIds?.includes(assignment.branchId))) throw fail(403, 'You do not have access to an assigned delivery branch.');
    const allowed = [];
    for (const assignment of assignments) if (await sharingEnabled(req.restaurant.id, assignment.branchId)) allowed.push(assignment);
    if (!allowed.length) throw fail(403, 'Restaurant location sharing is disabled for your assigned branch.');
    const capturedAt = new Date();
    const expiresAt = new Date(capturedAt.getTime() + 120_000);
    const io = req.app.get('io');
    for (const assignment of allowed) {
      const [location] = await DeliveryLocation.findOrCreate({
        where: { assignmentId: assignment.id },
        defaults: { restaurantId: req.restaurant.id, branchId: assignment.branchId, orderId: assignment.orderId, assignmentId: assignment.id, restaurantMemberId: member.id, latitude, longitude, accuracyMeters, capturedAt, expiresAt },
      });
      await location.update({ latitude, longitude, accuracyMeters, capturedAt, expiresAt, restaurantId: req.restaurant.id, branchId: assignment.branchId, orderId: assignment.orderId, restaurantMemberId: member.id });
      const point = { latitude, longitude, accuracyMeters, capturedAt: capturedAt.toISOString() };
      if (io) {
        io.to(`customer:${(await assignment.getOrder({ attributes: ['customerId'] })).customerId}`).emit('delivery:location-updated', { orderId: assignment.orderId, location: point });
        io.to(`delivery-tracking:${req.restaurant.id}:${assignment.branchId}`).emit('delivery:location-updated', { orderId: assignment.orderId, assignmentId: assignment.id, location: point });
      }
    }
    res.json({ success: true, capturedAt: capturedAt.toISOString(), expiresAt: expiresAt.toISOString(), assignmentsUpdated: allowed.length });
  } catch (error) { next(error); }
};

exports.stopLocation = async (req, res, next) => {
  try {
    const memberId = req.restaurantMembership?.id;
    const locations = await DeliveryLocation.findAll({ where: { restaurantId: req.restaurant.id, restaurantMemberId: memberId } });
    const io = req.app.get('io');
    const notified = new Set();
    for (const location of locations) {
      const key = `${location.orderId}:${location.branchId}`;
      if (notified.has(key)) continue;
      notified.add(key);
      const assignment = await DeliveryAssignment.findByPk(location.assignmentId);
      const order = assignment ? await assignment.getOrder({ attributes: ['customerId'] }) : null;
      if (io && order) io.to(`customer:${order.customerId}`).emit('delivery:location-cleared', { orderId: location.orderId });
      if (io) io.to(`delivery-tracking:${req.restaurant.id}:${location.branchId}`).emit('delivery:location-cleared', { orderId: location.orderId, assignmentId: location.assignmentId });
    }
    await DeliveryLocation.destroy({ where: { restaurantId: req.restaurant.id, restaurantMemberId: memberId } });
    res.json({ success: true, sharing: false });
  } catch (error) { next(error); }
};

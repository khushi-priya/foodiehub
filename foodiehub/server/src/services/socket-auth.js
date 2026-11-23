function invalidateRestaurantSockets(io, restaurantId) {
  if (!io || !restaurantId) return;
  io.in(`restaurant-membership:${restaurantId}`).disconnectSockets(true);
}

function rejectClientRoomSubscriptions(socket) {
  for (const event of [
    "join",
    "join-room",
    "join-delivery-room",
    "subscribe-room",
  ]) {
    socket.on(event, (room, acknowledge) => {
      if (typeof acknowledge === "function")
        acknowledge({
          success: false,
          message: "Room subscriptions are managed by the server.",
        });
    });
  }
}

function restaurantRoomsForMembership(membership, branchIds) {
  const permissions = new Set(
    (membership.role.permissions || []).map((permission) => permission.code),
  );
  const rooms = [`restaurant-membership:${membership.restaurantId}`];
  if (permissions.has("support.view"))
    rooms.push(`restaurant-support:${membership.restaurantId}`);
  for (const branchId of branchIds) {
    if (
      permissions.has("delivery_orders.view") ||
      permissions.has("delivery_assignments.view")
    )
      rooms.push(`delivery:${membership.restaurantId}:${branchId}`);
    if (permissions.has("delivery_tracking.view_branch"))
      rooms.push(`delivery-tracking:${membership.restaurantId}:${branchId}`);
    if (permissions.has("tables.view"))
      rooms.push(`floor:${membership.restaurantId}:${branchId}:tables`);
    if (permissions.has("orders.view"))
      rooms.push(`floor:${membership.restaurantId}:${branchId}:orders`);
    if (permissions.has("reservations.manage"))
      rooms.push(`floor:${membership.restaurantId}:${branchId}:reservations`);
  }
  if (permissions.has("delivery_orders.view_assigned"))
    rooms.push(`delivery-employee:${membership.restaurantId}:${membership.id}`);
  return rooms;
}

module.exports = {
  invalidateRestaurantSockets,
  rejectClientRoomSubscriptions,
  restaurantRoomsForMembership,
};

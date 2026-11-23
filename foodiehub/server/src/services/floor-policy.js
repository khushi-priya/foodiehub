const RESERVATION_TRANSITIONS = {
  pending: ["confirmed", "rejected", "cancelled"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["seated", "cancelled", "no_show"],
  seated: ["completed"],
  rejected: [],
  cancelled: [],
  completed: [],
  no_show: [],
};

function reservationTransitionAllowed(currentStatus, nextStatus) {
  return Boolean(RESERVATION_TRANSITIONS[currentStatus]?.includes(nextStatus));
}

function reservationIntervalsOverlap(startA, endA, startB, endB) {
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

function tableOccupancy({
  isActive,
  activeOrders = 0,
  seatedReservations = 0,
  futureReservations = 0,
  preferredStatus,
}) {
  if (!isActive) return "inactive";
  if (activeOrders || seatedReservations) return "occupied";
  if (futureReservations) return "reserved";
  return preferredStatus || "available";
}

function branchInScope(
  restaurantId,
  tableRestaurantId,
  allowedBranchIds,
  branchId,
) {
  return (
    restaurantId === tableRestaurantId &&
    (!allowedBranchIds || allowedBranchIds.includes(branchId))
  );
}

module.exports = {
  RESERVATION_TRANSITIONS,
  reservationTransitionAllowed,
  reservationIntervalsOverlap,
  tableOccupancy,
  branchInScope,
};

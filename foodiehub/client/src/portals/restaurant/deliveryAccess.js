export const DELIVERY_ROLE_CODES = new Set([
  "delivery_associate",
  "senior_delivery_associate",
  "delivery_supervisor",
]);

export function getDeliveryMembership(user) {
  return (
    (user?.restaurantMemberships || []).find((membership) => {
      if (membership.status !== "active") return false;
      const code =
        typeof membership.role === "string"
          ? membership.role
          : membership.role?.code;
      return (
        DELIVERY_ROLE_CODES.has(code) ||
        (typeof code === "string" && code.startsWith("custom_delivery_"))
      );
    }) || null
  );
}

export function hasDeliveryEmployeeAccess(user) {
  return (user?.restaurantMemberships || []).some((membership) => {
    if (membership.status !== "active") return false;
    const code =
      typeof membership.role === "string"
        ? membership.role
        : membership.role?.code;
    const permissions = (membership.role?.permissions || []).map(
      (permission) =>
        typeof permission === "string" ? permission : permission.code,
    );
    return (
      (DELIVERY_ROLE_CODES.has(code) ||
        (typeof code === "string" && code.startsWith("custom_delivery_"))) &&
      (permissions.includes("delivery_orders.view_assigned") ||
        permissions.includes("delivery_orders.view"))
    );
  });
}

const { AuditLog } = require("../models");
const { notifySuperAdmins } = require("./admin-notifications");

async function recordAuditEvent(req, event, options = {}) {
  const {
    action,
    entityType,
    entityId,
    reason = null,
    beforeData = null,
    afterData = null,
  } = event;
  if (
    ![action, entityType, entityId].every(
      (value) => typeof value === "string" && value.length > 0,
    )
  ) {
    throw new TypeError(
      "Audit events require an action, entity type, and entity ID.",
    );
  }

  const userAgent =
    req.get?.("user-agent") || req.headers?.["user-agent"] || null;
  const audit = await AuditLog.create(
    {
      actorUserId:
        req.user?.id || req.authUser?.id || req.session?.userId || null,
      actorRole:
        req.restaurantRole ||
        (req.user?.roles || []).map((role) => role.code).join(",") ||
        null,
      action,
      entityType,
      entityId: String(entityId),
      reason: reason == null ? null : String(reason).slice(0, 2000),
      beforeData,
      afterData,
      ipAddress: req.ip || null,
      userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
    },
    options,
  );
  const notify = () => {
    if ((req.user?.roles || []).some((role) => role.code === "super_admin"))
      notifySuperAdmins(req, {
        type: "admin_action",
        title: "Administrative action",
        message: `${action} · ${entityType} ${entityId}`,
        entityId,
        href: "/admin/system?tab=audit",
      });
  };
  if (options.transaction?.afterCommit) options.transaction.afterCommit(notify);
  else notify();
  return audit;
}

module.exports = { recordAuditEvent };

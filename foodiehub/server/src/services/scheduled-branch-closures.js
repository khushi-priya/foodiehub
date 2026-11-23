const { Op } = require("sequelize");
const sequelize = require("../config/database");
const { Branch, AuditLog } = require("../models");

async function reopenExpiredBranchClosures(now = new Date()) {
  const due = await Branch.unscoped().findAll({
    where: {
      operationalStatus: "temporarily_closed",
      isActive: true,
      approvalStatus: "approved",
      temporaryClosureUntil: { [Op.lte]: now },
      temporaryClosureToken: { [Op.ne]: null },
    },
    attributes: [
      "id",
      "temporaryClosureToken",
      "temporaryClosureUntil",
      "temporaryClosureReason",
    ],
    order: [["temporaryClosureUntil", "ASC"]],
    limit: 100,
  });
  let reopened = 0;
  for (const candidate of due) {
    await sequelize.transaction(async (transaction) => {
      const branch = await Branch.unscoped().findOne({
        where: {
          id: candidate.id,
          operationalStatus: "temporarily_closed",
          isActive: true,
          approvalStatus: "approved",
          temporaryClosureUntil: { [Op.lte]: now },
          temporaryClosureToken: candidate.temporaryClosureToken,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!branch) return;
      const beforeData = {
        operationalStatus: branch.operationalStatus,
        temporaryClosureUntil: branch.temporaryClosureUntil,
        temporaryClosureReason: branch.temporaryClosureReason,
      };
      await branch.update(
        {
          operationalStatus: "open",
          temporaryClosureUntil: null,
          temporaryClosureReason: null,
          temporaryClosureToken: null,
        },
        { transaction },
      );
      await AuditLog.create(
        {
          actorUserId: null,
          actorRole: "system",
          action: "restaurant.branch.reopened",
          entityType: "branch",
          entityId: branch.id,
          reason: "Scheduled reopening",
          beforeData,
          afterData: { operationalStatus: "open", scheduled: true },
          ipAddress: null,
          userAgent: "scheduled-branch-closure-worker",
        },
        { transaction },
      );
      reopened += 1;
    });
  }
  return reopened;
}

module.exports = { reopenExpiredBranchClosures };

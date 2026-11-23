const { branchIsOpen } = require("./branch-availability");

function assertApprovalTransition(currentStatus, nextStatus) {
  if (!["approved", "rejected", "suspended"].includes(nextStatus)) {
    throw Object.assign(new Error("Invalid approval status."), { status: 400 });
  }
  if (nextStatus === "rejected" && currentStatus !== "pending") {
    throw Object.assign(new Error("Only pending branches can be rejected."), {
      status: 409,
    });
  }
  if (nextStatus === "suspended" && currentStatus !== "approved") {
    throw Object.assign(new Error("Only approved branches can be suspended."), {
      status: 409,
    });
  }
  if (
    nextStatus === "approved" &&
    !["pending", "rejected", "suspended"].includes(currentStatus)
  ) {
    throw Object.assign(
      new Error("This branch cannot be approved from its current state."),
      { status: 409 },
    );
  }
}

function ownerResubmissionFields(currentStatus) {
  return currentStatus === "rejected"
    ? { approvalStatus: "pending", rejectionReason: null }
    : {};
}

function ownerCreateApprovalFields() {
  return { approvalStatus: "pending", rejectionReason: null };
}

function ownerBranchWhere(restaurantId, branchId) {
  return { id: branchId, restaurantId };
}

function isCustomerEligibleBranch(branch) {
  return Boolean(
    branch?.isActive &&
    branch.approvalStatus === "approved" &&
    branchIsOpen(branch),
  );
}

module.exports = {
  assertApprovalTransition,
  ownerResubmissionFields,
  ownerCreateApprovalFields,
  ownerBranchWhere,
  isCustomerEligibleBranch,
};

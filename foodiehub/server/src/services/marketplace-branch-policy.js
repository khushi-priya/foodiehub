const { Op } = require('sequelize');

function pendingBranchesVisibleForDevelopment() {
  const environment = process.env.NODE_ENV || 'development';
  return environment === 'development' && process.env.FOODIEHUB_DEV_SHOW_PENDING_BRANCHES === 'true';
}

function marketplaceBranchWhere() {
  return {
    isActive: true,
    // Availability is calculated from local operating hours at request time.
    // Explicit temporary closures and inactive branches remain hidden.
    operationalStatus: { [Op.notIn]: ['inactive', 'temporarily_closed'] },
    approvalStatus: pendingBranchesVisibleForDevelopment()
      ? { [Op.in]: ['approved', 'pending'] }
      : 'approved',
  };
}

function orderEligibleBranchWhere() {
  return {
    isActive: true,
    approvalStatus: 'approved',
    operationalStatus: { [Op.notIn]: ['inactive', 'temporarily_closed'] },
  };
}

module.exports = { pendingBranchesVisibleForDevelopment, marketplaceBranchWhere, orderEligibleBranchWhere };

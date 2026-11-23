
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EmployeeBranchAssignment = sequelize.define(
  'EmployeeBranchAssignment',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    restaurantMemberId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'restaurant_member_id',
      references: {
        model: 'restaurant_members',
        key: 'id',
      },
    },

    branchId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'branch_id',
      references: {
        model: 'branches',
        key: 'id',
      },
    },

    assignedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_by_user_id',
      references: {
        model: 'users',
        key: 'id',
      },
    },

    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active',
      allowNull: false,
    },
  },
  {
    tableName: 'employee_branch_assignments',
    indexes: [
      {
        unique: true,
        fields: ['restaurant_member_id', 'branch_id'],
      },
      { fields: ['status'] },
    ],
  }
);

module.exports = EmployeeBranchAssignment;

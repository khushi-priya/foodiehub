
'use strict';

const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const roles = [
      { name: 'Super Admin', code: 'super_admin', scope: 'platform' },
      { name: 'Customer', code: 'customer', scope: 'platform' },
      { name: 'Restaurant Owner', code: 'restaurant_owner', scope: 'restaurant' },
      { name: 'Manager', code: 'manager', scope: 'restaurant' },
      { name: 'Waiter', code: 'waiter', scope: 'restaurant' },
      { name: 'Kitchen Staff', code: 'kitchen_staff', scope: 'restaurant' },
      { name: 'Cashier', code: 'cashier', scope: 'restaurant' },
      { name: 'Delivery Partner', code: 'delivery_partner', scope: 'platform' },
    ].map((role) => ({
      id: randomUUID(),
      ...role,
      description: `${role.name} system role`,
      is_system: true,
      created_at: now,
      updated_at: now,
    }));

    const permissions = [
      // Platform administration
      ['admin.dashboard.view', 'admin', 'View admin dashboard'],
      ['admin.restaurants.manage', 'admin', 'Manage restaurants'],
      ['admin.branches.manage', 'admin', 'Manage branches'],
      ['admin.customers.manage', 'admin', 'Manage customers'],
      ['admin.orders.view', 'admin', 'View platform orders'],
      ['admin.subscriptions.manage', 'admin', 'Manage subscriptions'],
      ['admin.payments.manage', 'admin', 'Manage payments and settlements'],
      ['admin.reports.view', 'admin', 'View platform reports'],
      ['admin.settings.manage', 'admin', 'Manage platform settings'],

      // Restaurant operations
      ['restaurant.dashboard.view', 'restaurant', 'View restaurant dashboard'],
      ['restaurant.profile.manage', 'restaurant', 'Manage restaurant profile'],
      ['branches.view', 'branches', 'View branches'],
      ['branches.manage', 'branches', 'Manage branches'],
      ['employees.view', 'employees', 'View employees'],
      ['employees.manage', 'employees', 'Manage employees'],
      ['menu.view', 'menu', 'View menu'],
      ['menu.manage', 'menu', 'Manage menu and food items'],
      ['orders.view', 'orders', 'View restaurant orders'],
      ['orders.manage', 'orders', 'Manage restaurant orders'],
      ['orders.kitchen', 'orders', 'Manage kitchen tickets'],
      ['tables.view', 'tables', 'View restaurant tables'],
      ['tables.manage', 'tables', 'Manage tables'],
      ['reservations.manage', 'reservations', 'Manage reservations'],
      ['pos.access', 'pos', 'Access point of sale'],
      ['pos.manage', 'pos', 'Manage POS transactions'],
      ['payments.view', 'payments', 'View restaurant payments'],
      ['payments.refund', 'payments', 'Issue and reconcile full order refunds'],
      ['inventory.view', 'inventory', 'View inventory'],
      ['inventory.manage', 'inventory', 'Manage inventory'],
      ['reports.view', 'reports', 'View restaurant reports'],
      ['subscriptions.view', 'subscriptions', 'View restaurant subscription'],
      ['coupons.manage', 'coupons', 'Manage restaurant food coupons'],

      // Customer marketplace
      ['customer.profile.manage', 'customer', 'Manage customer profile'],
      ['customer.orders.manage', 'customer', 'Place and manage own orders'],
      ['customer.favourites.manage', 'customer', 'Manage favourite restaurants'],
      ['customer.reviews.manage', 'customer', 'Manage own reviews'],
      ['customer.reservations.manage', 'customer', 'Manage own reservations'],

      // Delivery
      ['delivery.dashboard.view', 'delivery', 'View delivery dashboard'],
      ['delivery.assignments.view', 'delivery', 'View assigned deliveries'],
      ['delivery.assignments.update', 'delivery', 'Update delivery status'],
    ].map(([code, module, description]) => ({
      id: randomUUID(),
      code,
      module,
      description,
      created_at: now,
      updated_at: now,
    }));

    const roleIds = Object.fromEntries(
      roles.map((role) => [role.code, role.id])
    );

    const permissionIds = Object.fromEntries(
      permissions.map((permission) => [permission.code, permission.id])
    );

    const permissionCodes = permissions.map((permission) => permission.code);

    const restaurantPermissions = permissionCodes.filter(
      (code) =>
        !code.startsWith('admin.') &&
        !code.startsWith('customer.') &&
        !code.startsWith('delivery.')
    );

    const assignments = {
      super_admin: permissionCodes.filter((code) => code.startsWith('admin.')),
      customer: permissionCodes.filter((code) => code.startsWith('customer.')),
      restaurant_owner: restaurantPermissions,
      manager: [
        'restaurant.dashboard.view',
        'branches.view',
        'employees.view',
        'menu.view',
        'menu.manage',
        'orders.view',
        'orders.manage',
        'orders.kitchen',
        'tables.view',
        'tables.manage',
        'reservations.manage',
        'inventory.view',
        'inventory.manage',
        'reports.view',
        'coupons.manage',
      ],
      waiter: [
        'restaurant.dashboard.view',
        'orders.view',
        'orders.manage',
        'tables.view',
        'reservations.manage',
      ],
      kitchen_staff: [
        'restaurant.dashboard.view',
        'orders.view',
        'orders.kitchen',
      ],
      cashier: [
        'restaurant.dashboard.view',
        'orders.view',
        'orders.manage',
        'pos.access',
        'pos.manage',
        'payments.view',
      ],
      delivery_partner: [
        'delivery.dashboard.view',
        'delivery.assignments.view',
        'delivery.assignments.update',
      ],
    };

    const rolePermissions = [];

    for (const [roleCode, codes] of Object.entries(assignments)) {
      for (const permissionCode of codes) {
        rolePermissions.push({
          role_id: roleIds[roleCode],
          permission_id: permissionIds[permissionCode],
        });
      }
    }

    await queryInterface.bulkInsert('roles', roles);
    await queryInterface.bulkInsert('permissions', permissions);
    await queryInterface.bulkInsert('role_permissions', rolePermissions);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('role_permissions', null, {});
    await queryInterface.bulkDelete('permissions', null, {});
    await queryInterface.bulkDelete('roles', null, {});
  },
};

'use strict';

const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const [existing] = await queryInterface.sequelize.query("SELECT id FROM permissions WHERE code = 'delivery_staff.set_availability'");
    let permissionId = existing[0]?.id;
    if (!permissionId) {
      permissionId = randomUUID();
      const now = new Date();
      await queryInterface.bulkInsert('permissions', [{ id: permissionId, code: 'delivery_staff.set_availability', module: 'delivery', description: 'Set own delivery availability', created_at: now, updated_at: now }]);
    }

    const [roles] = await queryInterface.sequelize.query("SELECT id, code FROM roles WHERE scope = 'restaurant' AND code IN ('restaurant_owner','delivery_associate','senior_delivery_associate','delivery_supervisor')");
    const links = roles.map((role) => ({ role_id: role.id, permission_id: permissionId }));
    if (links.length) {
      const roleIds = roles.map((role) => `'${role.id}'`).join(',');
      const [existingLinks] = await queryInterface.sequelize.query(`SELECT role_id FROM role_permissions WHERE permission_id = '${permissionId}' AND role_id IN (${roleIds})`);
      const linked = new Set(existingLinks.map((link) => link.role_id));
      const missing = links.filter((link) => !linked.has(link.role_id));
      if (missing.length) await queryInterface.bulkInsert('role_permissions', missing);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DELETE rp FROM role_permissions rp INNER JOIN permissions p ON p.id = rp.permission_id WHERE p.code = 'delivery_staff.set_availability'");
    await queryInterface.bulkDelete('permissions', { code: 'delivery_staff.set_availability' });
  },
};

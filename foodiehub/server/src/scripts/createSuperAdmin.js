
require('dotenv').config();

const bcrypt = require('bcrypt');
const sequelize = require('../config/database');

const {
  User,
  Role,
  UserRole,
} = require('../models');

async function createSuperAdmin() {
  try {
    const firstName = process.env.SUPER_ADMIN_FIRST_NAME?.trim();
    const lastName = process.env.SUPER_ADMIN_LAST_NAME?.trim();
    const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SUPER_ADMIN_PASSWORD;

    if (!firstName || !lastName || !email || !password) {
      throw new Error(
        'Set SUPER_ADMIN_FIRST_NAME, SUPER_ADMIN_LAST_NAME, SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in your .env file.'
      );
    }

    if (password.length < 12) {
      throw new Error('Super Admin password must be at least 12 characters.');
    }

    await sequelize.authenticate();

    const role = await Role.findOne({
      where: {
        code: 'super_admin',
        scope: 'platform',
      },
    });

    if (!role) {
      throw new Error(
        'Super Admin role not found. Run the role and permission seeder first.'
      );
    }

    const existingAdminCount = await UserRole.count({
      where: { roleId: role.id },
    });

    if (existingAdminCount > 0) {
      throw new Error(
        'A Super Admin already exists. This bootstrap script cannot create another one.'
      );
    }

    const existingUser = await User.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new Error(
        'This email already belongs to a user. Use a different email.'
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await sequelize.transaction(async (transaction) => {
      const user = await User.create(
        {
          firstName,
          lastName,
          email,
          passwordHash,
          status: 'active',
        },
        { transaction }
      );

      await UserRole.create(
        {
          userId: user.id,
          roleId: role.id,
        },
        { transaction }
      );

      console.log('\nSuper Admin account created successfully.');
      console.log(`Name: ${firstName} ${lastName}`);
      console.log(`Email: ${email}`);
      console.log('Role: Super Admin');
    });
  } catch (error) {
    console.error('\nSuper Admin creation failed:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

createSuperAdmin();

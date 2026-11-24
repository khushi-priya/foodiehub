
const bcrypt = require('bcrypt');

const {
  User,
  Role,
  Permission,
  RestaurantMember,
  Restaurant,
} = require('../../models');
const { notifySuperAdmins } = require('../../services/admin-notifications');
const { issueOtp, findPendingCustomer, otpDigest, safeEqual, OTP_MAX_ATTEMPTS } = require('../../services/customer-email-verification');

const COOKIE_NAME = 'foodiehub.sid';

const PHONE_REGEX = /^[6-9]\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#]).{8,20}$/;

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

// Generate a URL-friendly restaurant slug.
const generateSlug = (value) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Find an unused restaurant slug.
const getUniqueSlug = async (name, transaction) => {
  const baseSlug = generateSlug(name);

  let slug = baseSlug;
  let counter = 1;

  while (
    await Restaurant.findOne({
      where: { slug },
      transaction,
    })
  ) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

// RESTAURANT OWNER SELF-REGISTRATION
exports.registerRestaurant = async (req, res, next) => {
  try {
    const {
      restaurantName,
      restaurantEmail,
      restaurantPhone,
      description,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      ownerPhone,
      password,
      confirmPassword,
    } = req.body || {};

    // Required field validation.
    const requiredFields = {
      restaurantName,
      restaurantEmail,
      restaurantPhone,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      password,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (typeof value !== 'string' || !value.trim()) {
        return res.status(400).json({
          success: false,
          message: `${field} is required.`,
        });
      }
    }

    const normalizedRestaurantName = restaurantName.trim();
    const normalizedOwnerFirstName = ownerFirstName.trim();
    const normalizedOwnerLastName = ownerLastName.trim();

    const normalizedRestaurantEmail =
      restaurantEmail.trim().toLowerCase();

    const normalizedOwnerEmail =
      ownerEmail.trim().toLowerCase();

    const normalizedRestaurantPhone =
      restaurantPhone.trim();

    const normalizedOwnerPhone =
      typeof ownerPhone === 'string' && ownerPhone.trim()
        ? ownerPhone.trim()
        : null;

    // Validate restaurant and owner details.
    if (
      !EMAIL_REGEX.test(normalizedRestaurantEmail) ||
      !EMAIL_REGEX.test(normalizedOwnerEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid email addresses.',
      });
    }

    if (!PHONE_REGEX.test(normalizedRestaurantPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid 10-digit restaurant mobile number.',
      });
    }

    if (
      normalizedOwnerPhone &&
      !PHONE_REGEX.test(normalizedOwnerPhone)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid 10-digit owner mobile number.',
      });
    }

    // Strong password validation.
    if (!PASSWORD_REGEX.test(password)) {
  return res.status(400).json({
    success: false,
    message:
      'Password must be between 8 and 20 characters and include uppercase, lowercase, number and special character.',
  });
}

    // Confirm password validation.
    if (
      confirmPassword !== undefined &&
      (
        typeof confirmPassword !== 'string' ||
        password !== confirmPassword
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Password and confirm password do not match.',
      });
    }

    // Create all registration records atomically.
    const result = await Restaurant.sequelize.transaction(
      async (transaction) => {
        // Check owner email.
        const existingOwner = await User.findOne({
          where: {
            email: normalizedOwnerEmail,
          },
          transaction,
        });

        if (existingOwner) {
          const error = new Error(
            'An account with this owner email already exists.'
          );
          error.statusCode = 409;
          throw error;
        }

        // Check owner phone when supplied.
        if (normalizedOwnerPhone) {
          const existingPhone = await User.findOne({
            where: {
              phone: normalizedOwnerPhone,
            },
            transaction,
          });

          if (existingPhone) {
            const error = new Error(
              'This owner phone number is already registered.'
            );
            error.statusCode = 409;
            throw error;
          }
        }

        // Check restaurant email.
        const existingRestaurant = await Restaurant.findOne({
          where: {
            email: normalizedRestaurantEmail,
          },
          transaction,
        });

        if (existingRestaurant) {
          const error = new Error(
            'A restaurant with this email already exists.'
          );
          error.statusCode = 409;
          throw error;
        }

        // Find the existing restaurant owner role.
        const ownerRole = await Role.findOne({
          where: {
            code: 'restaurant_owner',
            scope: 'restaurant',
          },
          transaction,
        });

        if (!ownerRole) {
          const error = new Error(
            'Restaurant owner role has not been configured.'
          );
          error.statusCode = 500;
          throw error;
        }

        // Hash the password provided by the owner.
        const passwordHash = await bcrypt.hash(password, 12);

        const slug = await getUniqueSlug(
          normalizedRestaurantName,
          transaction
        );

        // Create restaurant application.
        const restaurant = await Restaurant.create(
          {
            name: normalizedRestaurantName,
            slug,
            email: normalizedRestaurantEmail,
            phone: normalizedRestaurantPhone,
            description:
              typeof description === 'string'
                ? description.trim() || null
                : null,

            approvalStatus: 'pending',
            listingStatus: 'draft',
            marketplaceEnabled: false,
            rejectionReason: null,
          },
          { transaction }
        );

        // Create the owner's login account.
        // The owner can log in and track the application.
        const owner = await User.create(
          {
            firstName: normalizedOwnerFirstName,
            lastName: normalizedOwnerLastName,
            email: normalizedOwnerEmail,
            phone: normalizedOwnerPhone,
            passwordHash,
            status: 'active',
          },
          { transaction }
        );

        // Create active membership so the owner can see
        // their pending restaurant in the /auth/me response.
        const membership = await RestaurantMember.create(
          {
            restaurantId: restaurant.id,
            userId: owner.id,
            roleId: ownerRole.id,
            status: 'active',
            joinedAt: new Date(),
          },
          { transaction }
        );

        return {
          restaurant,
          owner,
          membership,
        };
      }
    );

    notifySuperAdmins(req, { type: 'restaurant_registration', title: 'New restaurant registration', message: `${result.restaurant.name} is awaiting review.`, entityId: result.restaurant.id, href: '/admin/restaurants' });

    return res.status(201).json({
      success: true,
      message:
        'Registration submitted successfully. You can now log in and track your restaurant application.',
      data: {
        owner: {
          id: result.owner.id,
          firstName: result.owner.firstName,
          lastName: result.owner.lastName,
          email: result.owner.email,
          status: result.owner.status,
        },
        restaurant: {
          id: result.restaurant.id,
          name: result.restaurant.name,
          slug: result.restaurant.slug,
          email: result.restaurant.email,
          phone: result.restaurant.phone,
          approvalStatus: result.restaurant.approvalStatus,
          listingStatus: result.restaurant.listingStatus,
          marketplaceEnabled:
            result.restaurant.marketplaceEnabled,
        },
        membership: {
          id: result.membership.id,
          role: 'restaurant_owner',
          status: result.membership.status,
        },
      },
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message:
          'An account or restaurant with these details already exists.',
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
};

// LOGIN

exports.registerCustomer = async (req, res, next) => {
  const transaction = await User.sequelize.transaction();
  try {
    const { firstName, lastName = '', email, phone = '', password, confirmPassword } = req.body || {};
    if (!firstName || typeof firstName !== 'string' || firstName.trim().length > 100) throw Object.assign(new Error('First name is required and must be 100 characters or fewer.'), { status: 400 });
    if (typeof lastName !== 'string' || lastName.length > 100) throw Object.assign(new Error('Last name must be 100 characters or fewer.'), { status: 400 });
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 150) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
    if (!PHONE_REGEX.test(normalizedPhone)) throw Object.assign(new Error('Enter a valid 10-digit mobile number.'), { status: 400 });
    if (typeof password !== 'string' || !PASSWORD_REGEX.test(password)) throw Object.assign(new Error('Use a password with 8–20 characters, including upper and lowercase letters, a number, and a symbol.'), { status: 400 });
    if (password !== confirmPassword) throw Object.assign(new Error('Password confirmation does not match.'), { status: 400 });

    const existingByEmail = await User.unscoped().findOne({ where: { email: normalizedEmail }, transaction, lock: transaction.LOCK.UPDATE });
    const existingByPhone = await User.unscoped().findOne({ where: { phone: normalizedPhone }, transaction, lock: transaction.LOCK.UPDATE });
    if (existingByPhone && (!existingByEmail || existingByPhone.id !== existingByEmail.id)) {
      await transaction.commit();
      return res.status(409).json({ success: false, code: 'PHONE_ALREADY_REGISTERED', message: 'This mobile number is already in use.' });
    }

    if (existingByEmail) {
      const existingCustomer = await findPendingCustomer(normalizedEmail, transaction, true);
      if (!existingCustomer) {
        await transaction.commit();
        return res.status(409).json({ success: false, code: 'EMAIL_ALREADY_REGISTERED', message: 'This email is already registered. Please sign in.' });
      }
      if (existingCustomer.emailVerifiedAt) {
        await transaction.commit();
        return res.status(409).json({ success: false, code: 'EMAIL_ALREADY_REGISTERED', message: 'This email is already registered. Please sign in.' });
      }
      if (!['pending', 'active'].includes(existingCustomer.status)) {
        await transaction.commit();
        return res.status(409).json({ success: false, code: 'ACCOUNT_UNAVAILABLE', message: 'This account cannot be verified. Please contact FoodieHub support.' });
      }
      await transaction.commit();
      await issueOtp(existingCustomer);
      return res.status(200).json({ success: true, code: 'EMAIL_VERIFICATION_PENDING', message: 'A verification code has been sent to your email.', data: { email: existingCustomer.email, requiresEmailVerification: true } });
    }

    const role = await Role.findOne({ where: { code: 'customer', scope: 'platform' }, transaction });
    if (!role) throw Object.assign(new Error('Customer role has not been configured.'), { status: 500 });
    const user = await User.create({ firstName: firstName.trim(), lastName: lastName.trim() || null, email: normalizedEmail, phone: normalizedPhone || null, passwordHash: await bcrypt.hash(password, 12), status: 'pending' }, { transaction });
    const { UserRole } = require('../../models');
    await UserRole.create({ userId: user.id, roleId: role.id }, { transaction });
    await transaction.commit();
    await issueOtp(user);
    return res.status(201).json({ success: true, message: 'A verification code has been sent to your email.', data: { email: user.email, requiresEmailVerification: true } });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      try {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
        const existingCustomer = email ? await findPendingCustomer(email) : null;
        const existingPhone = phone ? await User.unscoped().findOne({ where: { phone } }) : null;
        if (existingPhone && (!existingCustomer || existingPhone.id !== existingCustomer.id)) return res.status(409).json({ success: false, code: 'PHONE_ALREADY_REGISTERED', message: 'This mobile number is already in use.' });
        if (existingCustomer && !existingCustomer.emailVerifiedAt && ['pending', 'active'].includes(existingCustomer.status)) {
          await issueOtp(existingCustomer);
          return res.status(200).json({ success: true, code: 'EMAIL_VERIFICATION_PENDING', message: 'A verification code has been sent to your email.', data: { email: existingCustomer.email, requiresEmailVerification: true } });
        }
        return res.status(409).json({ success: false, code: 'EMAIL_ALREADY_REGISTERED', message: 'This email is already registered. Please sign in.' });
      } catch (conflictError) {
        if (conflictError.status) return res.status(conflictError.status).json({ success: false, code: conflictError.code, message: conflictError.message, ...(conflictError.retryAfterSeconds ? { retryAfterSeconds: conflictError.retryAfterSeconds } : {}), ...(conflictError.status === 429 || conflictError.status === 503 ? { data: { email: typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '', requiresEmailVerification: true } } : {}) });
        return res.status(409).json({ success: false, code: 'ACCOUNT_ALREADY_EXISTS', message: 'An account already exists with these details. Please sign in or check the mobile number.' });
      }
    }
    if (error.status) return res.status(error.status).json({ success: false, code: error.code || 'CUSTOMER_REGISTRATION_FAILED', message: error.message, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}), ...(error.status === 429 || error.status === 503 ? { data: { email: typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '', requiresEmailVerification: true } } : {}) });
    return next(error);
  }
};

exports.verifyCustomerEmail = async (req, res, next) => {
  const transaction = await User.sequelize.transaction();
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) throw Object.assign(new Error('Enter a valid email and six-digit verification code.'), { status: 400 });
    const user = await findPendingCustomer(email, transaction, true);
    if (!user || user.emailVerifiedAt || !['pending', 'active'].includes(user.status) || !user.emailVerificationOtpHash) throw Object.assign(new Error('The verification code is invalid or expired.'), { status: 400, code: 'OTP_INVALID' });
    if (new Date(user.emailVerificationOtpExpiresAt) <= new Date()) {
      await user.update({ emailVerificationOtpHash: null, emailVerificationOtpExpiresAt: null }, { transaction });
      await transaction.commit();
      return res.status(400).json({ success: false, code: 'OTP_EXPIRED', message: 'This verification code has expired. Request a new one.' });
    }
    if (user.emailVerificationOtpAttempts >= OTP_MAX_ATTEMPTS) throw Object.assign(new Error('Too many incorrect attempts. Request a new verification code.'), { status: 429, code: 'OTP_ATTEMPTS_EXCEEDED' });
    const expected = otpDigest(user.id, otp);
    if (!safeEqual(user.emailVerificationOtpHash, expected)) {
      const attempts = Number(user.emailVerificationOtpAttempts || 0) + 1;
      await user.update({ emailVerificationOtpAttempts: attempts, ...(attempts >= OTP_MAX_ATTEMPTS ? { emailVerificationOtpHash: null, emailVerificationOtpExpiresAt: null } : {}) }, { transaction });
      await transaction.commit();
      return res.status(attempts >= OTP_MAX_ATTEMPTS ? 429 : 400).json({ success: false, code: attempts >= OTP_MAX_ATTEMPTS ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_INVALID', message: attempts >= OTP_MAX_ATTEMPTS ? 'Too many verification attempts. Please request a new code later.' : 'The verification code is incorrect.' });
    }
    await user.update({ status: 'active', emailVerifiedAt: new Date(), emailVerificationOtpHash: null, emailVerificationOtpExpiresAt: null, emailVerificationOtpAttempts: 0, emailVerificationOtpSentAt: null, emailVerificationOtpRequestCount: 0, emailVerificationOtpRequestWindowAt: null }, { transaction });
    await transaction.commit();
    return res.json({ success: true, message: 'Email verified. You can now sign in.' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.status) return res.status(error.status).json({ success: false, ...(error.code ? { code: error.code } : {}), message: error.message, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) });
    return next(error);
  }
};

exports.resendCustomerEmailOtp = async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    const user = await findPendingCustomer(email);
    if (!user) return res.status(404).json({ success: false, code: 'CUSTOMER_VERIFICATION_NOT_AVAILABLE', message: 'No customer account awaiting email verification was found for this email.' });
    if (user.emailVerifiedAt) return res.status(409).json({ success: false, code: 'EMAIL_ALREADY_VERIFIED', message: 'This email is already verified. Please sign in.' });
    if (!['pending', 'active'].includes(user.status)) return res.status(409).json({ success: false, code: 'ACCOUNT_UNAVAILABLE', message: 'This account cannot be verified. Please contact FoodieHub support.' });
    await issueOtp(user);
    return res.json({ success: true, message: 'A verification code has been sent to your email.', retryAfterSeconds: 45 });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, ...(error.code ? { code: error.code } : {}), message: error.message, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) });
    return next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';

    const password = req.body?.password;

    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const portal = req.body?.portal;
    if (!['customer', 'restaurant', 'admin'].includes(portal)) {
      return res.status(400).json({ success: false, message: 'Choose a valid login portal.' });
    }

    const user = await User.findOne({
      where: { email },
      include: [{ model: Role, as: 'roles', attributes: ['id', 'code', 'scope'], through: { attributes: [] }, required: false }],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const globalRoles = (user.roles || []).filter((role) => role.scope === 'platform').map((role) => role.code);
    if (portal === 'customer' && !globalRoles.includes('customer')) {
      return res.status(403).json({ success: false, message: 'This account does not have customer access. Choose the correct login portal.' });
    }
    if (portal === 'customer' && !user.emailVerifiedAt) return res.status(403).json({ success: false, code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before signing in.' });
    if (portal === 'admin' && !globalRoles.includes('super_admin')) {
      return res.status(403).json({ success: false, message: 'This account is not authorized for the admin portal.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your account is not active.',
      });
    }

    if (portal === 'restaurant') {
      const activeMembership = await RestaurantMember.findOne({
        where: { userId: user.id, status: 'active' },
        include: [{ model: Role, as: 'role', where: { scope: 'restaurant' }, attributes: ['id'], required: true }],
        attributes: ['id'],
      });
      if (!activeMembership) return res.status(403).json({ success: false, message: 'This account does not have active restaurant access.' });
    }

    // Portal switching is explicit: credentials and server-side role checks above
    // must succeed before the existing session is replaced with a fresh ID.
    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

    await user.update({
      lastLoginAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    next(error);
  }
};


// LOGOUT
exports.logout = async (req, res, next) => {
  try {
    req.session.destroy((error) => {
      if (error) return next(error);

      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });

      return res.status(200).json({
        success: true,
        message: 'Logged out successfully.',
      });
    });
  } catch (error) {
    next(error);
  }
};

// CURRENT LOGGED-IN USER
exports.me = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.session.userId, {
      attributes: {
        exclude: ['passwordHash', 'emailVerificationOtpHash', 'emailVerificationOtpExpiresAt', 'emailVerificationOtpAttempts', 'emailVerificationOtpSentAt', 'emailVerificationOtpRequestCount', 'emailVerificationOtpRequestWindowAt'],
      },
      include: [
        {
          model: Role,
          as: 'roles',
          attributes: ['id', 'name', 'code', 'scope'],
          through: {
            attributes: [],
          },
        },
        {
          model: RestaurantMember,
          as: 'restaurantMemberships',
          where: { status: 'active' },
          required: false,
          attributes: [
            'id',
            'restaurantId',
            'roleId',
            'status',
          ],
          include: [
            {
              model: Role,
              as: 'role',
              attributes: ['id', 'name', 'code', 'scope'],
              include: [{ model: Permission, as: 'permissions', attributes: ['code'], through: { attributes: [] } }],
            },
            {
              model: Restaurant,
              as: 'restaurant',
              attributes: [
                'id',
                'name',
                'slug',
                'approvalStatus',
                'listingStatus',
                'marketplaceEnabled',
                'rejectionReason',
              ],
            },
          ],
        },
      ],
    });

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Your session is invalid. Please log in again.',
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
};

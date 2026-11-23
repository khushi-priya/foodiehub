
// const express = require('express');
// const cors = require('cors');
// const helmet = require('helmet');

// const { sessionMiddleware } = require('./config/session');

// const app = express();

// const defaultCsp = helmet.contentSecurityPolicy.getDefaultDirectives();
// app.use(helmet({
//   contentSecurityPolicy: {
//     directives: {
//       ...defaultCsp,
//       'script-src': [...defaultCsp['script-src'], 'https://checkout.razorpay.com'],
//       'connect-src': ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
//       'frame-src': ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
//       'form-action': [...defaultCsp['form-action'], 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
//     },
//   },
// }));

// app.use(
//   cors({
//     origin: process.env.CLIENT_URL || 'http://localhost:5173',
//     credentials: true,
//   })
// );

// app.use(express.json({ limit: '2mb' }));
// app.use(express.urlencoded({ extended: true }));

// // Session authentication
// app.use(sessionMiddleware);

// app.get('/api/v1/health', (req, res) => {
//   res.status(200).json({
//     success: true,
//     message: 'FoodieHub API is running successfully!',
//     environment: process.env.NODE_ENV || 'development',
//     timestamp: new Date().toISOString(),
//   });
// });

// app.use('/api/v1/auth', require('./modules/auth/auth.routes'));
// app.use('/api/v1/admin', require('./modules/admin/admin.routes'));
// app.use('/api/v1/restaurant/menu', require('./modules/restaurants/menu.routes'));
// app.use('/api/v1/restaurant/branches', require('./modules/restaurants/branch.routes'));
// app.use('/api/v1/restaurant/tables', require('./modules/restaurants/table.routes'));
// app.use('/api/v1/restaurant/orders', require('./modules/orders/order.routes'));
// app.use('/api/v1/public', require('./modules/public/public.routes'));
// app.use('/api/v1/customer', require('./modules/customer/customer.routes'));

// app.use((req, res) => {
//   res.status(404).json({
//     success: false,
//     message: 'API endpoint not found',
//   });
// });

// app.use((error, req, res, next) => {
//   console.error(error);

//   res.status(error.status || 500).json({
//     success: false,
//     message:
//       process.env.NODE_ENV === 'production'
//         ? 'Internal server error'
//         : error.message,
//   });
// });

// module.exports = app;


const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { sessionMiddleware } = require('./config/session');

const app = express();

// Allow frontend origins from environment configuration.
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://10.1.1.223:5173',
  ...(process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
]);
// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'https://checkout.razorpay.com',
        ],
        connectSrc: [
          "'self'",
          'http://localhost:5000',
          'http://127.0.0.1:5000',
          'http://10.1.1.223:5000',
          'ws://localhost:5173',
          'ws://127.0.0.1:5173',
          'ws://10.1.1.223:5173',
          'https://api.razorpay.com',
          'https://checkout.razorpay.com',
        ],
        frameSrc: [
          "'self'",
          'https://api.razorpay.com',
          'https://checkout.razorpay.com',
        ],
        formAction: [
          "'self'",
          'https://api.razorpay.com',
          'https://checkout.razorpay.com',
        ],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        styleSrc: ["'self'", 'https:'],
        fontSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  })
);


// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header (e.g. Postman).
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);

// Request parsing
app.use(express.json({ limit: '2mb', verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: true }));

// Session authentication
app.use(sessionMiddleware);

// Health check
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'FoodieHub API is running successfully!',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/v1/auth', require('./modules/auth/auth.routes'));
app.use('/api/v1/admin', require('./modules/admin/admin.routes'));
app.use('/api/v1/restaurant/subscription', require('./modules/subscriptions/restaurant.routes'));
app.use('/api/v1/restaurant/coupons', require('./modules/restaurants/coupon.routes'));
app.use('/api/v1/restaurant/team', require('./modules/restaurants/team.routes'));
app.use('/api/v1/restaurant/delivery', require('./modules/restaurants/delivery.routes'));
app.use('/api/v1/restaurant/delivery', require('./modules/restaurants/delivery-orders.routes'));
app.post('/api/v1/webhooks/razorpay', require('./modules/restaurants/payments.controller').razorpayWebhook);
app.use('/api/v1/restaurant/payments', require('./modules/restaurants/payments.routes'));
app.use('/api/v1/restaurant/support', require('./modules/support/restaurant.routes'));
app.use('/api/v1/restaurant/business', require('./modules/restaurants/business.routes'));
app.use('/api/v1/restaurant/inventory', require('./modules/restaurants/inventory.routes'));
app.use('/api/v1/restaurant/pos', require('./modules/restaurants/pos.routes'));
app.use('/api/v1/restaurant/settings', require('./modules/restaurants/settings.routes'));
app.use('/api/v1/restaurant/menu', require('./modules/restaurants/menu.routes'));
app.use('/api/v1/restaurant/branches', require('./modules/restaurants/branch.routes'));
app.use('/api/v1/restaurant/tables', require('./modules/restaurants/table.routes'));
app.use('/api/v1/restaurant/floor', require('./modules/restaurants/floor.routes'));
app.use('/api/v1/restaurant/orders', require('./modules/orders/order.routes'));
app.use('/api/v1/public', require('./modules/public/public.routes'));
app.use('/api/v1/customer', require('./modules/customer/customer.routes'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error(error);

  res.status(error.status || 500).json({
    success: false,
    ...(error.code ? { code: error.code, currentStatus: error.currentStatus ?? null, requiredStatus: error.requiredStatus ?? null } : {}),
    message:
      error.status && error.status < 500
        ? error.message
        : process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message,
  });
});

module.exports = app;

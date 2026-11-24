
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const { Op } = require('sequelize');
const app = require('./app');
const sequelize = require('./config/database');
const { sessionStore, sessionMiddleware } = require('./config/session');
const { User, RestaurantMember, Role, Permission, EmployeeBranchAssignment, Branch } = require('./models');
const { reopenExpiredBranchClosures } = require('./services/scheduled-branch-closures');
const { processTimedOutAssignments, processAutomaticAssignments } = require('./modules/restaurants/delivery-orders.controller');
const { rejectClientRoomSubscriptions, restaurantRoomsForMembership } = require('./services/socket-auth');
const { readSmtpConfig } = require('./services/customer-email-verification');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      const allowed = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://10.1.1.223:5173', ...(process.env.CLIENT_URL || '').split(',').map((value) => value.trim()).filter(Boolean)]);
      callback(null, !origin || allowed.has(origin));
    },
    credentials: true,
  },
});
app.set('io', io);
io.engine.use((req, res, next) => sessionMiddleware(req, res || {}, next));
io.use(async (socket, next) => {
  try {
    const userId = socket.request.session?.userId;
    const user = userId ? await User.findByPk(userId, { attributes: ['id', 'status'] }) : null;
    if (!user || user.status !== 'active') return next(new Error('Authentication required'));
    const userRoles = await user.getRoles({ attributes: ['code'] });
    const memberships = await RestaurantMember.findAll({
      where: { userId, status: 'active' },
      include: [
        { model: Role, as: 'role', attributes: ['code'], required: true, include: [{ model: Permission, as: 'permissions', where: { code: { [Op.in]: ['tables.view', 'orders.view', 'orders.manage', 'orders.manage_status', 'orders.kitchen', 'kitchen.update_status', 'reservations.view', 'reservations.manage', 'reservations.update', 'support.view', 'support.create', 'delivery_orders.view', 'delivery_assignments.view', 'delivery_orders.view_assigned', 'delivery_tracking.view_branch', 'payments.view', 'payments.transactions.view', 'employees.view', 'employees.manage', 'branches.view', 'branches.manage', 'menu.view'] } }, attributes: ['code'], through: { attributes: [] }, required: true }] },
        { model: EmployeeBranchAssignment, as: 'branchAssignments', where: { status: 'active' }, attributes: ['branchId'], required: false },
      ],
    });
    const rooms = userRoles.some((role) => role.code === 'customer') ? [`customer:${user.id}`] : [];
    if (userRoles.some((role) => role.code === 'super_admin')) rooms.push('super_admin');
  for (const membership of memberships) {
      const branchIds = membership.role.code === 'restaurant_owner'
        ? (await Branch.findAll({ where: { restaurantId: membership.restaurantId }, attributes: ['id'], raw: true })).map((branch) => branch.id)
        : (membership.branchAssignments || []).map((assignment) => assignment.branchId);
      rooms.push(...restaurantRoomsForMembership(membership, new Set(branchIds)));
    }
    socket.data.floorRooms = rooms;
    next();
  } catch (error) { next(error); }
});
io.on('connection', (socket) => {
  for (const room of socket.data.floorRooms || []) socket.join(room);
  rejectClientRoomSubscriptions(socket);
});

async function startServer() {
  try {
    await sequelize.authenticate();

    console.log('FoodieHub MySQL connected successfully!');
    try {
      readSmtpConfig();
      console.log('Customer email SMTP settings are valid; the connection will be verified before the first OTP email.');
    } catch (error) {
      console.warn(`Customer email SMTP is not ready (${error.code || 'SMTP_CONFIG_INVALID'}); OTP requests will return a safe service-unavailable response.`);
    }

    // Create the session storage table if it doesn't exist
    await sessionStore.sync();

    let closureWorkerRunning = false;
    const runClosureWorker = async () => {
      if (closureWorkerRunning) return;
      closureWorkerRunning = true;
      try { await reopenExpiredBranchClosures(); }
      catch (error) { console.error('Scheduled branch reopening failed:', error.message); }
      finally { closureWorkerRunning = false; }
    };
    void runClosureWorker();
    const closureWorkerTimer = setInterval(runClosureWorker, 60_000);
    closureWorkerTimer.unref();
    const runDeliveryAssignmentWorker = async () => {
      try { await processTimedOutAssignments(io); await processAutomaticAssignments(io); }
      catch (error) { console.error('Delivery assignment timeout processing failed:', error.message); }
    };
    void runDeliveryAssignmentWorker();
    const deliveryAssignmentTimer = setInterval(runDeliveryAssignmentWorker, 60_000);
    deliveryAssignmentTimer.unref();

    console.log('FoodieHub session storage is ready!');

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`FoodieHub server running on port ${PORT}`);
      console.log(`Health check available at http://<server-ip>:${PORT}/api/v1/health`);
    });
  } catch (error) {
    console.error('Unable to start FoodieHub:', error.message);
    process.exit(1);
  }
}

startServer();

process.on('SIGINT', async () => {
  console.log('Shutting down FoodieHub server...');

  server.close(async () => {
    await sequelize.close();
    process.exit(0);
  });
});

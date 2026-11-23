
import { lazy, Suspense } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import AdminLogin from '../portals/admin/pages/AdminLogin';
import AdminDashboard from '../portals/admin/pages/AdminDashboard';
import RestaurantManagement from '../portals/admin/pages/RestaurantManagement';
import AdminLayout from '../portals/admin/layouts/AdminLayout';

import RestaurantLogin from '../portals/restaurant/pages/RestaurantLogin';
import RestaurantRegister from '../portals/restaurant/pages/RestaurantRegister';
import RestaurantDashboard from '../portals/restaurant/pages/RestaurantDashboard';
import RestaurantMenu from '../portals/restaurant/pages/RestaurantMenu';
import RestaurantBranches from '../portals/restaurant/pages/RestaurantBranches';
import RestaurantLayout from '../portals/restaurant/layouts/RestaurantLayout';
import RestaurantCategories from '../portals/restaurant/pages/RestaurantCategories';

import CustomerLayout from '../portals/customer/layouts/CustomerLayout';
import CustomerLogin from '../portals/customer/pages/CustomerLogin';
import CustomerRegister from '../portals/customer/pages/CustomerRegister';
const CustomerAddresses = lazy(() => import('../portals/customer/pages/CustomerPages').then((module) => ({ default: module.CustomerAddresses })));
const CustomerPlaceholder = lazy(() => import('../portals/customer/pages/CustomerPages').then((module) => ({ default: module.CustomerPlaceholder })));
const CustomerProfile = lazy(() => import('../portals/customer/pages/CustomerPages').then((module) => ({ default: module.CustomerProfile })));
const CustomerWishlist = lazy(() => import('../portals/customer/pages/CustomerPages').then((module) => ({ default: module.CustomerWishlist })));
const RestaurantOrders = lazy(() => import('../portals/restaurant/pages/RestaurantOrders'));
const RestaurantTables = lazy(() => import('../portals/restaurant/pages/RestaurantTables'));
const RestaurantReservations = lazy(() => import('../portals/restaurant/pages/RestaurantReservations'));
const RestaurantSubscription = lazy(() => import('../portals/restaurant/pages/RestaurantSubscription'));
const RestaurantCoupons = lazy(() => import('../portals/restaurant/pages/RestaurantCoupons'));
const RestaurantTeam = lazy(() => import('../portals/restaurant/pages/RestaurantTeam'));
const RestaurantDeliverySettings = lazy(() => import('../portals/restaurant/pages/RestaurantDeliverySettings'));
const RestaurantDeliveryReports = lazy(() => import('../portals/restaurant/pages/RestaurantDeliveryReports'));
const RestaurantDeliveryLiveMap = lazy(() => import('../portals/restaurant/pages/RestaurantDeliveryLiveMap'));
const RestaurantDeliveryOverview = lazy(() => import('../portals/restaurant/pages/RestaurantDeliveryOverview'));
const RestaurantDeliveryAssignments = lazy(() => import('../portals/restaurant/pages/RestaurantDeliveryAssignments'));
const RestaurantSettings = lazy(() => import('../portals/restaurant/pages/RestaurantSettings'));
const AcceptRestaurantInvite = lazy(() => import('../portals/restaurant/pages/AcceptRestaurantInvite'));
const KitchenDisplay = lazy(() => import('../portals/restaurant/pages/OrderOperations').then((module) => ({ default: module.KitchenDisplay })));
const WaiterOperations = lazy(() => import('../portals/restaurant/pages/OrderOperations').then((module) => ({ default: module.WaiterOperations })));
const CustomerCart = lazy(() => import('../portals/customer/pages/CustomerCart'));
const CustomerCheckout = lazy(() => import('../portals/customer/pages/CustomerCheckout'));
const CustomerOrderDetails = lazy(() => import('../portals/customer/pages/CustomerOrderDetails'));
const CustomerSupport = lazy(() => import('../portals/customer/pages/CustomerSupport'));
const CustomerNotifications = lazy(() => import('../portals/customer/pages/CustomerNotifications'));
const CustomerSettings = lazy(() => import('../portals/customer/pages/CustomerSettings'));
const CustomerOrderHistory = lazy(() => import('../portals/customer/pages/CustomerOrders'));
const CustomerReservations = lazy(() => import('../portals/customer/pages/CustomerReservations'));
const Home = lazy(() => import('../portals/customer/pages/Home'));
const Restaurants = lazy(() => import('../portals/customer/pages/Restaurants'));
const RestaurantDetails = lazy(() => import('../portals/customer/pages/RestaurantDetails'));
const QrMenu = lazy(() => import('../portals/customer/pages/QrMenu'));
const CustomerDashboard = lazy(() => import('../portals/customer/pages/CustomerDashboard'));
const AdminBranches = lazy(() => import('../portals/admin/pages/AdminBranches'));
const FoodCategories = lazy(() => import('../portals/admin/pages/FoodCategories'));
const FoodCategoryRequests = lazy(() => import('../portals/admin/pages/FoodCategoryRequests'));
const AllFoodItems = lazy(() => import('../portals/admin/pages/AllFoodItems'));
const Customers = lazy(() => import('../portals/admin/pages/Customers'));
const AdminOrders = lazy(() => import('../portals/admin/pages/Orders'));
const AdminSubscriptions = lazy(() => import('../portals/admin/pages/Subscriptions'));
const AdminCoupons = lazy(() => import('../portals/admin/pages/Coupons'));
const AdminCommissions = lazy(() => import('../portals/admin/pages/Commissions'));
const AdminPayments = lazy(() => import('../portals/admin/pages/AdminPayments'));
const AdminReports = lazy(() => import('../portals/admin/pages/ReportsAnalytics'));
const AdminSystem = lazy(() => import('../portals/admin/pages/System'));
const AdminSupport = lazy(() => import('../portals/admin/pages/AdminSupport'));
const RestaurantSupport = lazy(() => import('../portals/restaurant/pages/RestaurantSupport'));
const RestaurantDeliveryStaff = lazy(() => import('../portals/restaurant/pages/RestaurantDeliveryStaff'));
const RestaurantDeliveryRoles = lazy(() => import('../portals/restaurant/pages/RestaurantDeliveryRoles'));
const RestaurantDeliveryDashboard = lazy(() => import('../portals/restaurant/pages/RestaurantDeliveryDashboard'));
const RestaurantDeliveryOrders = lazy(() => import('../portals/restaurant/pages/RestaurantDeliveryOrders'));
const RestaurantInventory = lazy(() => import('../portals/restaurant/pages/RestaurantInventory'));
const RestaurantPOS = lazy(() => import('../portals/restaurant/pages/RestaurantPOS'));
const RestaurantPayments = lazy(() => import('../portals/restaurant/pages/RestaurantPayments'));

import ProtectedRoute from './ProtectedRoute';
import { getUserRoles, useAuth } from '../context/AuthContext';
import { hasDeliveryEmployeeAccess } from '../portals/restaurant/deliveryAccess';

function RestaurantHomeRedirect() {
  const { user } = useAuth();
  const roles = getUserRoles(user);
  const membership = (user?.restaurantMemberships || []).find((item) => item.status === 'active');
  const permissions = (membership?.role?.permissions || []).map((item) => typeof item === 'string' ? item : item.code);
  const path = roles.includes('restaurant_owner') ? '/restaurant/dashboard' : hasDeliveryEmployeeAccess(user) ? '/restaurant/delivery/dashboard' : roles.includes('kitchen_staff') && permissions.includes('orders.kitchen') ? '/restaurant/kitchen' : roles.includes('waiter') && permissions.includes('orders.manage') ? '/restaurant/waiter' : roles.includes('cashier') && permissions.includes('pos.access') ? '/restaurant/pos' : roles.includes('cashier') && permissions.includes('orders.view') ? '/restaurant/orders' : permissions.includes('restaurant.dashboard.view') ? '/restaurant/dashboard' : permissions.includes('orders.kitchen') ? '/restaurant/kitchen' : permissions.includes('tables.view') ? '/restaurant/tables' : '/restaurant/orders';
  return <Navigate to={path} replace />;
}

function Unauthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center">
      <div className="max-w-md">
        <h1 className="text-3xl font-bold text-slate-900">
          Access denied
        </h1>

        <p className="mt-3 text-slate-500">
          You don't have permission to access this page.
          Please sign in using an authorized account.
        </p>

        <a
          href="/login"
          className="mt-6 inline-block rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600"
        >
          Back to FoodieHub Login
        </a>
      </div>
    </div>
  );
}

function RestaurantCouponAccess() {
  const { user } = useAuth();
  const membership = (user?.restaurantMemberships || []).find((item) => item.status === 'active' && (typeof item.role === 'string' ? item.role : item.role?.code) === 'restaurant_owner')
    || (user?.restaurantMemberships || []).find((item) => item.status === 'active');
  const role = typeof membership?.role === 'string' ? membership.role : membership?.role?.code;
  const permissions = Array.isArray(membership?.role?.permissions) ? membership.role.permissions.map((permission) => typeof permission === 'string' ? permission : permission.code) : [];
  return role === 'restaurant_owner' || permissions.includes('coupons.manage') ? <RestaurantCoupons /> : <Navigate to="/unauthorized" replace />;
}

function RestaurantMembershipRoute({ children, permission }) {
  const { user } = useAuth();
  const memberships = user?.restaurantMemberships || [];
  const isAllowed = (item) => {
    if (item.status !== 'active') return false;
    if (!permission) return true;
    const permissions = Array.isArray(item.role?.permissions) ? item.role.permissions.map((entry) => typeof entry === 'string' ? entry : entry.code) : [];
    return Array.isArray(permission) ? permission.some((code) => permissions.includes(code)) : permissions.includes(permission);
  };
  const membership = memberships.find((item) => isAllowed(item) && (typeof item.role === 'string' ? item.role : item.role?.code) === 'restaurant_owner') || memberships.find(isAllowed);
  if (!membership) return <Navigate to="/unauthorized" replace />;
  return children;
}

function RestaurantOwnerRoute({ children }) {
  const { user } = useAuth();
  const ownerMembership = (user?.restaurantMemberships || []).find((item) => item.status === 'active' && (typeof item.role === 'string' ? item.role : item.role?.code) === 'restaurant_owner');
  return ownerMembership ? children : <Navigate to="/unauthorized" replace />;
}

function RestaurantMembershipLayout() {
  const { user } = useAuth();
  return user?.restaurantMemberships?.some((item) => item.status === 'active') ? <RestaurantLayout /> : <Navigate to="/unauthorized" replace />;
}

function DeliveryEmployeeRoute({ children }) {
  const { user } = useAuth();
  return hasDeliveryEmployeeAccess(user) ? children : <Navigate to="/unauthorized" replace />;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#fffaf6] text-sm text-slate-500">Loading FoodieHub…</div>}>
      <Routes>
        {/* Default */}
        <Route
          path="/"
          element={<Home />}
        />
        <Route path="/restaurants" element={<Restaurants />} />
        <Route path="/restaurants/:slug" element={<RestaurantDetails />} />
        <Route path="/qr/:token" element={<QrMenu />} />
        <Route path="/customer/login" element={<CustomerLogin />} />
        <Route path="/customer/register" element={<CustomerRegister />} />

        {/* Super Admin Login */}
        <Route
          path="/login"
          element={<AdminLogin />}
        />

        <Route
          path="/admin/login"
          element={<AdminLogin />}
        />

        {/* Restaurant Public Pages */}
        <Route
          path="/restaurant/login"
          element={<RestaurantLogin />}
        />

        <Route
          path="/restaurant/register"
          element={<RestaurantRegister />}
        />
        <Route path="/restaurant/accept-invite" element={<AcceptRestaurantInvite />} />
        <Route path="/restaurant/delivery/dashboard" element={<ProtectedRoute><DeliveryEmployeeRoute><RestaurantDeliveryDashboard /></DeliveryEmployeeRoute></ProtectedRoute>} />

        {/* Restaurant Owner Portal */}
        <Route
          path="/restaurant"
          element={
            <ProtectedRoute><RestaurantMembershipLayout /></ProtectedRoute>
          }
        >
          <Route
            index
            element={<RestaurantHomeRedirect />}
          />

          <Route path="dashboard" element={<RestaurantMembershipRoute permission="restaurant.dashboard.view"><RestaurantDashboard /></RestaurantMembershipRoute>} />
          <Route path="menu" element={<RestaurantMembershipRoute permission="menu.view"><RestaurantMenu /></RestaurantMembershipRoute>} />
          <Route path="categories" element={<RestaurantMembershipRoute permission="menu.view"><RestaurantCategories /></RestaurantMembershipRoute>} />
          <Route path="branches" element={<RestaurantMembershipRoute permission="branches.view"><RestaurantBranches /></RestaurantMembershipRoute>} />
          <Route path="subscription" element={<ProtectedRoute allowedRoles={['restaurant_owner']}><RestaurantSubscription /></ProtectedRoute>} />
          <Route path="coupons" element={<RestaurantCouponAccess />} />
          <Route path="orders" element={<RestaurantMembershipRoute permission="orders.view"><RestaurantOrders /></RestaurantMembershipRoute>} />
          <Route path="tables" element={<RestaurantMembershipRoute permission="tables.view"><RestaurantTables /></RestaurantMembershipRoute>} />
          <Route path="reservations" element={<RestaurantMembershipRoute permission={['reservations.view','reservations.manage']}><RestaurantReservations /></RestaurantMembershipRoute>} />
          <Route path="inventory" element={<RestaurantMembershipRoute permission="inventory.view"><RestaurantInventory /></RestaurantMembershipRoute>} />
          <Route path="payments" element={<RestaurantMembershipRoute permission="payments.view"><RestaurantPayments /></RestaurantMembershipRoute>} />
          <Route path="payments/transactions" element={<RestaurantMembershipRoute permission="payments.transactions.view"><RestaurantPayments /></RestaurantMembershipRoute>} />
          <Route path="payments/cod-collections" element={<RestaurantMembershipRoute permission="payments.cod.view"><RestaurantPayments /></RestaurantMembershipRoute>} />
          <Route path="payments/cash-reconciliation" element={<RestaurantMembershipRoute permission="payments.cash_reconcile"><RestaurantPayments /></RestaurantMembershipRoute>} />
          <Route path="payments/settlements" element={<RestaurantMembershipRoute permission="payments.settlements.view"><RestaurantPayments /></RestaurantMembershipRoute>} />
          <Route path="payments/refunds" element={<RestaurantMembershipRoute permission="payments.refunds.view"><RestaurantPayments /></RestaurantMembershipRoute>} />
          <Route path="pos" element={<RestaurantMembershipRoute permission="pos.access"><RestaurantPOS /></RestaurantMembershipRoute>} />
          <Route path="kitchen" element={<RestaurantMembershipRoute permission="orders.kitchen"><KitchenDisplay /></RestaurantMembershipRoute>} />
          <Route path="waiter" element={<RestaurantMembershipRoute permission="orders.manage"><WaiterOperations /></RestaurantMembershipRoute>} />
          <Route path="employees" element={<RestaurantMembershipRoute permission="employees.view"><RestaurantTeam /></RestaurantMembershipRoute>} />
          <Route path="roles" element={<RestaurantMembershipRoute permission="employees.manage_roles"><RestaurantTeam /></RestaurantMembershipRoute>} />
          <Route path="attendance" element={<RestaurantMembershipRoute permission={['attendance.view','attendance.check_in']}><RestaurantTeam /></RestaurantMembershipRoute>} />
          <Route path="settings/:section?" element={<RestaurantMembershipRoute permission="business.view"><RestaurantSettings /></RestaurantMembershipRoute>} />
          <Route path="profile" element={<Navigate to="/restaurant/settings/restaurant-information" replace />} />
          <Route path="business-settings" element={<Navigate to="/restaurant/settings/operating-preferences" replace />} />
          <Route path="support" element={<RestaurantMembershipRoute permission="support.view"><RestaurantSupport /></RestaurantMembershipRoute>} />
          <Route path="delivery" element={<RestaurantOwnerRoute><RestaurantDeliveryOverview /></RestaurantOwnerRoute>} />
          <Route path="delivery/orders" element={<RestaurantMembershipRoute permission="delivery_orders.view"><RestaurantDeliveryOrders /></RestaurantMembershipRoute>} />
          <Route path="delivery/staff" element={<RestaurantOwnerRoute><RestaurantDeliveryStaff /></RestaurantOwnerRoute>} />
          <Route path="delivery/roles" element={<RestaurantOwnerRoute><RestaurantDeliveryRoles /></RestaurantOwnerRoute>} />
          <Route path="delivery/assignments" element={<RestaurantMembershipRoute permission="delivery_assignments.view"><RestaurantDeliveryAssignments /></RestaurantMembershipRoute>} />
          <Route path="delivery/live-map" element={<RestaurantOwnerRoute><RestaurantDeliveryLiveMap /></RestaurantOwnerRoute>} />
          <Route path="delivery/settings" element={<RestaurantOwnerRoute><RestaurantDeliverySettings /></RestaurantOwnerRoute>} />
          <Route path="delivery/reports" element={<RestaurantMembershipRoute permission="delivery_reports.view"><RestaurantDeliveryReports /></RestaurantMembershipRoute>} />
        </Route>

        {/* Customer Portal */}
        <Route
          path="/customer"
          element={
            <ProtectedRoute allowedRoles={['customer']}>
              <CustomerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/customer/dashboard" replace />} />
          <Route path="dashboard" element={<CustomerDashboard />} />
          <Route path="orders" element={<CustomerOrderHistory />} />
          <Route path="reservations" element={<CustomerReservations />} />
          <Route path="orders/:orderId" element={<CustomerOrderDetails />} />
          <Route path="cart" element={<CustomerCart />} />
          <Route path="checkout" element={<CustomerCheckout />} />
          <Route path="wishlist" element={<CustomerWishlist />} />
          <Route path="addresses" element={<CustomerAddresses />} />
          <Route path="profile" element={<CustomerProfile />} />
          <Route path="support" element={<CustomerSupport />} />
          <Route path="notifications" element={<CustomerNotifications />} />
          <Route path="settings" element={<CustomerSettings />} />
        </Route>

        {/* Super Admin Portal */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['super_admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route
            index
            element={<Navigate to="/admin/dashboard" replace />}
          />

          <Route
            path="dashboard"
            element={<AdminDashboard />}
          />

          <Route
            path="restaurants"
            element={<RestaurantManagement />}
          />
          <Route path="branches" element={<AdminBranches />} />
          <Route path="food-categories" element={<FoodCategories />} />
          <Route path="category-requests" element={<FoodCategoryRequests />} />
          <Route path="food-items" element={<AllFoodItems />} />
          <Route path="customers" element={<Customers />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="delivery/assignments" element={<RestaurantDeliveryAssignments platformMode />} />
          <Route path="subscriptions" element={<AdminSubscriptions />} />
          <Route path="coupons" element={<AdminCoupons />} />
          <Route path="commissions" element={<AdminCommissions />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="system" element={<AdminSystem />} />
          <Route path="support" element={<AdminSupport />} />
        </Route>

        {/* Unauthorized */}
        <Route
          path="/unauthorized"
          element={<Unauthorized />}
        />

        {/* Unknown Routes */}
        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

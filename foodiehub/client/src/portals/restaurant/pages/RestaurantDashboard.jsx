
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag,
  IndianRupee,
  Clock3,
  CheckCircle2,
  Store,
  ArrowUpRight,
  ClipboardList,
  Utensils,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../services/api';

function getRestaurantMembership(user) {
  const memberships = user?.restaurantMemberships || [];

  return (
    memberships.find((membership) => {
      const role =
        typeof membership.role === 'string'
          ? membership.role
          : membership.role?.code;

      return (
        membership.status === 'active' &&
        role === 'restaurant_owner'
      );
    }) ||
    memberships.find(
      (membership) => membership.status === 'active'
    ) ||
    null
  );
}

function getOrderStatus(order) {
  return String(
    order?.status || order?.orderStatus || 'pending'
  ).toLowerCase();
}

function getOrderDate(order) {
  return (
    order?.createdAt ||
    order?.created_at ||
    order?.orderDate ||
    order?.date ||
    null
  );
}

function getOrderAmount(order) {
  return Number(
    order?.grandTotal ??
    order?.totalAmount ??
    order?.total ??
    order?.finalAmount ??
    order?.payableAmount ??
    0
  );
}

function getTodayKey() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function isToday(dateValue) {
  if (!dateValue) return false;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return false;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}` === getTodayKey();
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return 'Date unavailable';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLabel(value) {
  return String(value || 'Pending')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getCustomerName(order) {
  return (
    order?.customer?.name ||
    order?.customerName ||
    order?.user?.name ||
    order?.user?.firstName ||
    order?.deliveryAddress?.name ||
    'Customer'
  );
}

function getOrderNumber(order) {
  return (
    order?.orderNumber ||
    order?.orderCode ||
    order?.displayOrderId ||
    order?.id ||
    '—'
  );
}

function StatusBadge({ status }) {
  const normalized = String(status || 'pending').toLowerCase();

  const styles = {
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    ready: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    rejected: 'bg-red-50 text-red-700 ring-red-200',
    cancelled: 'bg-red-50 text-red-700 ring-red-200',
    suspended: 'bg-red-50 text-red-700 ring-red-200',
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    accepted: 'bg-blue-50 text-blue-700 ring-blue-200',
    preparing: 'bg-orange-50 text-orange-700 ring-orange-200',
    processing: 'bg-orange-50 text-orange-700 ring-orange-200',
    draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${
        styles[normalized] || styles.pending
      }`}
    >
      {formatLabel(normalized)}
    </span>
  );
}

function StatCard({ title, value, description, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">
            {title}
          </p>

          <p className="mt-3 text-2xl font-bold text-slate-800">
            {value}
          </p>

          <p className="mt-2 text-xs text-slate-400">
            {description}
          </p>
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
          <Icon size={21} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50 px-4 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
        <ClipboardList size={22} />
      </div>

      <p className="mt-3 text-sm font-semibold text-slate-700">
        {title}
      </p>

      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">
        {description}
      </p>
    </div>
  );
}

export default function RestaurantDashboard() {
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const membership = useMemo(
    () => getRestaurantMembership(user),
    [user]
  );

  const restaurant = membership?.restaurant;

  const restaurantName =
    restaurant?.name ||
    restaurant?.restaurantName ||
    'Your Restaurant';

  const ownerName = [
    user?.firstName,
    user?.lastName,
  ].filter(Boolean).join(' ') || 'Restaurant Owner';

  const approvalStatus =
    restaurant?.approvalStatus ||
    restaurant?.status ||
    'pending';

  const listingStatus = restaurant?.listingStatus || 'draft';

  const isApproved = approvalStatus === 'approved';

  // Fetch restaurant orders
  const loadOrders = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      const [response, branchResponse] = await Promise.all([
        api.get('/restaurant/orders', { params: { limit: 100 } }),
        api.get('/restaurant/branches', { params: { page: 1, limit: 100, status: 'all' } }),
      ]);

      const responseData = response?.data?.data;

      const fetchedOrders =
        responseData?.orders ||
        response?.data?.orders ||
        (Array.isArray(responseData) ? responseData : []) ||
        [];

      setOrders(
        Array.isArray(fetchedOrders) ? fetchedOrders : []
      );
      setBranches(Array.isArray(branchResponse?.data?.data?.branches)
        ? branchResponse.data.data.branches
        : []);
    } catch (err) {
      console.error('Restaurant dashboard orders error:', err);

      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Unable to load restaurant orders.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Dashboard calculations
  const dashboardStats = useMemo(() => {
    const todayOrders = orders.filter((order) =>
      isToday(getOrderDate(order))
    );

    const activeOrders = orders.filter((order) => {
      const status = getOrderStatus(order);

      return ![
        'completed',
        'delivered',
        'cancelled',
        'rejected',
      ].includes(status);
    });

    const completedOrders = orders.filter((order) => {
      const status = getOrderStatus(order);

      return ['completed', 'delivered'].includes(status);
    });

    const todayCompletedOrders = todayOrders.filter((order) => {
      const status = getOrderStatus(order);

      return ['completed', 'delivered'].includes(status);
    });

    const todaySales = todayCompletedOrders.reduce(
      (total, order) => total + getOrderAmount(order),
      0
    );

    return {
      todaySales,
      todayOrders: todayOrders.length,
      pendingOrders: activeOrders.length,
      completedOrders: completedOrders.length,
    };
  }, [orders]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => {
        const dateA = new Date(getOrderDate(a) || 0).getTime();
        const dateB = new Date(getOrderDate(b) || 0).getTime();

        return dateB - dateA;
      })
      .slice(0, 5);
  }, [orders]);

  return (
    <div className="space-y-7">
      {/* Page heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-slate-400">
            Workspace / Dashboard
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            Restaurant Dashboard
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Welcome back, {ownerName}. Here's your restaurant overview.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 shadow-sm">
            <Store size={17} className="text-orange-500" />

            <span className="max-w-[180px] truncate font-medium">
              {restaurantName}
            </span>
          </div>

          <button
            type="button"
            onClick={() => loadOrders(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'animate-spin' : ''}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Restaurant approval */}
      {!isApproved && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Clock3 size={22} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-semibold text-amber-900">
                  Restaurant approval pending
                </h2>

                <StatusBadge status={approvalStatus} />
              </div>

              <p className="mt-2 text-sm leading-6 text-amber-800">
                Your owner account is active. The FoodieHub Super Admin
                still needs to review your restaurant before it can be
                approved for the platform.
              </p>

              {restaurant?.rejectionReason && (
                <p className="mt-3 rounded-lg bg-white/70 p-3 text-sm text-red-700">
                  <strong>Review note:</strong>{' '}
                  {restaurant.rejectionReason}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {isApproved && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2
              size={22}
              className="shrink-0 text-emerald-600"
            />

            <div>
              <p className="font-semibold text-emerald-900">
                Your restaurant is approved
              </p>

              <p className="mt-1 text-sm text-emerald-800">
                Your restaurant has been approved by FoodieHub.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Branch availability is fetched from the branch API, which recalculates
          operating status using each branch's timezone on every request. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">Branch operating status</h2>
            <p className="mt-1 text-sm text-slate-500">Availability follows each branch’s local hours and closure settings.</p>
          </div>
          <Link to="/restaurant/branches" className="text-sm font-semibold text-orange-700 hover:text-orange-800">Manage branches</Link>
        </div>
        {branches.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {branches.map((branch) => {
            const active = branch.isActive && branch.operationalStatus !== 'inactive';
            const status = !active ? 'Inactive' : branch.availabilityStatus === 'open' ? 'Open' : 'Closed';
            const statusStyle = status === 'Open' ? 'bg-emerald-50 text-emerald-700' : status === 'Inactive' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800';
            return <div key={branch.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{branch.name}</p><p className="mt-1 text-xs text-slate-500">{branch.openingTime?.slice(0, 5) || '—'}–{branch.closingTime?.slice(0, 5) || '—'} · {branch.timeZone || 'Asia/Kolkata'}</p></div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusStyle}`}>{status}</span>
            </div>;
          })}
        </div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No branches are available for this restaurant.</p>}
      </section>

      {/* Restaurant information */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
              <Utensils size={26} />
            </div>

            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-slate-800">
                {restaurantName}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Restaurant owner workspace
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Approval
              </p>

              <div className="mt-1">
                <StatusBadge status={approvalStatus} />
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Listing
              </p>

              <div className="mt-1">
                <StatusBadge status={listingStatus} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Overview statistics */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              Overview
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Your restaurant's key performance indicators.
            </p>
          </div>

          <span className="text-xs text-slate-400">
            {loading ? 'Updating...' : `${orders.length} orders loaded`}
          </span>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle
              size={19}
              className="mt-0.5 shrink-0 text-red-600"
            />

            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                Could not load dashboard data
              </p>

              <p className="mt-1 text-sm text-red-700">
                {error}
              </p>

              <button
                type="button"
                onClick={() => loadOrders(true)}
                className="mt-2 text-sm font-semibold text-red-800 underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Today's Sales"
            value={loading ? '...' : money(dashboardStats.todaySales)}
            description="Sales from completed orders today"
            icon={IndianRupee}
          />

          <StatCard
            title="Today's Orders"
            value={loading ? '...' : dashboardStats.todayOrders}
            description="Orders received today"
            icon={ShoppingBag}
          />

          <StatCard
            title="Pending Orders"
            value={loading ? '...' : dashboardStats.pendingOrders}
            description="Orders not yet completed"
            icon={Clock3}
          />

          <StatCard
            title="Completed Orders"
            value={loading ? '...' : dashboardStats.completedOrders}
            description="Completed orders"
            icon={CheckCircle2}
          />
        </div>
      </section>

      {/* Lower dashboard panels */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Recent orders */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">
                Recent Orders
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                Your latest restaurant orders
              </p>
            </div>

            <ShoppingBag size={19} className="text-orange-500" />
          </div>

          <div className="mt-5">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <RefreshCw size={17} className="animate-spin" />
                Loading recent orders...
              </div>
            ) : recentOrders.length === 0 ? (
              <EmptyState
                title="No orders available yet"
                description="Your recent restaurant orders will appear here."
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {recentOrders.map((order, index) => (
                  <div
                    key={order.id || order._id || index}
                    className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        Order #{getOrderNumber(order)}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {getCustomerName(order)}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {formatDate(getOrderDate(order))}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <p className="text-sm font-semibold text-slate-800">
                        {money(getOrderAmount(order))}
                      </p>

                      <StatusBadge status={getOrderStatus(order)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Quick overview */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">
                Quick Overview
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                Restaurant account information
              </p>
            </div>

            <ArrowUpRight size={19} className="text-orange-500" />
          </div>

          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <span className="text-sm text-slate-500">
                Owner
              </span>

              <span className="text-right text-sm font-semibold text-slate-800">
                {ownerName}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <span className="text-sm text-slate-500">
                Owner email
              </span>

              <span className="max-w-[60%] truncate text-right text-sm font-semibold text-slate-800">
                {user?.email || '—'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <span className="text-sm text-slate-500">
                Membership
              </span>

              <StatusBadge status={membership?.status || 'unknown'} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-500">
                Restaurant approval
              </span>

              <StatusBadge status={approvalStatus} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

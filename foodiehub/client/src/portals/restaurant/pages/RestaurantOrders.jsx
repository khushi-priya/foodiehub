
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Eye,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  X,
  Phone,
  Receipt,
  CreditCard,
  Package,
  ChevronUp,
  Truck,
  UserRound,
} from "lucide-react";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";

const statuses = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "rejected",
  "cancelled",
];

const statusStyle = {
  pending: "bg-amber-50 text-amber-700",
  accepted: "bg-blue-50 text-blue-700",
  preparing: "bg-orange-50 text-orange-700",
  ready: "bg-emerald-50 text-emerald-700",
  out_for_delivery: "bg-orange-50 text-orange-700",
  completed: "bg-slate-100 text-slate-600",
  rejected: "bg-rose-50 text-rose-700",
  cancelled: "bg-rose-50 text-rose-700",
};

const label = (value = "") =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const quantity = (value) => `${Number(value || 0)} ×`;

const message = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Unable to load orders.";

const dateValue = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
        statusStyle[status] || statusStyle.completed
      }`}
    >
      {label(status || "unknown")}
    </span>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-500">
        <ClipboardList size={25} strokeWidth={1.6} />
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-800">
        {title}
      </h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function formatDeliveryAddress(value) {
  if (!value) return "";
  if (typeof value === "object") return [value.house, value.street, value.landmark, value.city, value.state, value.postalCode].filter(Boolean).join(", ");
  try {
    const address = JSON.parse(value);
    if (address && typeof address === "object") return [address.house, address.street, address.landmark, address.city, address.state, address.postalCode].filter(Boolean).join(", ");
  } catch {}
  return String(value);
}

function DeliveryStatusBadge({ status }) {
  const styles = {
    pending_acceptance: "bg-amber-100 text-amber-800",
    accepted: "bg-blue-100 text-blue-800",
    arriving_at_restaurant: "bg-indigo-100 text-indigo-800",
    picked_up: "bg-violet-100 text-violet-800",
    on_the_way: "bg-sky-100 text-sky-800",
    delivered: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
    failed: "bg-rose-100 text-rose-800",
    cancelled: "bg-slate-100 text-slate-700",
    reassigned: "bg-slate-100 text-slate-700",
  };
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${styles[status] || "bg-slate-100 text-slate-700"}`}>{label(status || "unknown")}</span>;
}

function DeliveryAssignmentDialog({ order, staff, selectedStaffId, loading, saving, error, onSelect, onAssign, onClose }) {
  const address = formatDeliveryAddress(order.deliveryAddress);
  const activeStatuses = ["pending_acceptance", "accepted", "arriving_at_restaurant", "picked_up", "on_the_way"];
  const isReassignment = activeStatuses.includes(order.deliveryAssignment?.status);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="delivery-assignment-title" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6">
      <header className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-orange-600">Delivery assignment</p><h2 id="delivery-assignment-title" className="mt-1 text-xl font-extrabold text-slate-900">Order #{order.orderNumber}</h2><p className="mt-1 text-sm text-slate-500">Choose an active associate assigned to this order’s branch.</p></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close delivery assignment" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">×</button></header>
      <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><p className="text-xs font-semibold text-slate-500">Customer</p><p className="mt-1 font-semibold text-slate-800">{order.customerName || "Customer"}</p>{order.customerPhone && <a className="mt-1 inline-flex items-center gap-1 text-xs text-orange-700" href={`tel:${order.customerPhone}`}><Phone size={12}/>{order.customerPhone}</a>}</div><div><p className="text-xs font-semibold text-slate-500">Branch</p><p className="mt-1 font-semibold text-slate-800">{order.branch?.name || "Branch unavailable"}</p></div><div className="sm:col-span-2"><p className="text-xs font-semibold text-slate-500">Delivery address</p><p className="mt-1 text-slate-700">{address || "Address not available"}</p>{order.customerNotes && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">Instructions: {order.customerNotes}</p>}</div></div>
      <div className="mt-5"><h3 className="text-sm font-bold text-slate-800">Available delivery associates</h3>{loading ? <div className="flex min-h-24 items-center justify-center text-sm text-slate-500"><LoaderCircle className="mr-2 animate-spin" size={17}/>Loading branch associates…</div> : staff.length ? <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{staff.map((employee) => <label key={employee.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selectedStaffId === employee.id ? "border-orange-300 bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}><input type="radio" name="delivery-associate" value={employee.id} checked={selectedStaffId === employee.id} onChange={() => onSelect(employee.id)} className="accent-orange-600"/><span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-sm font-bold text-orange-800">{employee.profilePhotoUrl ? <img src={employee.profilePhotoUrl} alt="" className="h-full w-full object-cover"/> : <UserRound size={18}/>}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{employee.fullName}</span><span className="mt-0.5 block text-xs text-slate-500">{employee.phone || "No phone listed"} · {employee.role}</span></span><span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold capitalize text-emerald-700">{employee.availabilityStatus?.replaceAll("_", " ") || "available"}</span></label>)}</div> : !error && <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No eligible delivery associates are currently available for this branch.</p>}</div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <footer className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={saving} className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button><button type="button" onClick={onAssign} disabled={loading || saving || !selectedStaffId} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">{saving && <LoaderCircle size={16} className="animate-spin"/>}{saving ? "Assigning…" : isReassignment ? "Confirm reassignment" : order.deliveryAssignment ? "Assign another associate" : "Assign delivery"}</button></footer>
    </section>
  </div>;
}

export default function RestaurantOrders() {
  const { user } = useAuth();
  const activeMemberships = (user?.restaurantMemberships || []).filter((membership) => membership.status === "active");
  const activeMembership = activeMemberships.find((membership) => (typeof membership.role === "string" ? membership.role : membership.role?.code) === "restaurant_owner") || activeMemberships[0];
  const grantedPermissions = new Set((activeMembership?.role?.permissions || []).map((permission) => typeof permission === "string" ? permission : permission.code));
  const canCreateDeliveryAssignment = grantedPermissions.has("delivery_assignments.create");
  const canReassignDelivery = grantedPermissions.has("delivery_assignments.reassign");
  const canRefund = (user?.restaurantMemberships || []).some((membership) => {
    if (membership.status !== "active") return false;
    const role = typeof membership.role === "string" ? membership.role : membership.role?.code;
    const permissions = (membership.role?.permissions || []).map((permission) => typeof permission === "string" ? permission : permission.code);
    return role === "restaurant_owner" || permissions.includes("payments.refund");
  });
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [countData, setCountData] = useState({});

  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });

  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || "");
  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);
  const [assignmentOrder, setAssignmentOrder] = useState(null);
  const [eligibleStaff, setEligibleStaff] = useState([]);
  const [assignmentStaffId, setAssignmentStaffId] = useState("");
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = {
        limit: 20,
        page,
      };

      if (filter !== "all") params.status = filter;
      if (search.trim()) params.search = search.trim();
      if (branchId) params.branchId = branchId;
      if (from) params.from = from;
      if (to) params.to = to;

      const [result, branchResult] = await Promise.all([
        api.get("/restaurant/orders", { params }),
        api.get("/restaurant/branches", {
          params: { limit: 100 },
        }),
      ]);

      const data = result.data?.data || {};
      const branchData = branchResult.data?.data || {};

      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setCountData(data.statusCounts || {});

      setPagination(
        data.pagination || {
          page: 1,
          totalPages: 1,
          total: 0,
        }
      );

      setBranches(
        Array.isArray(branchData.branches)
          ? branchData.branches
          : []
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [filter, search, branchId, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () =>
      statuses.reduce(
        (value, status) => ({
          ...value,
          [status]: Number(countData[status] || 0),
        }),
        {
          all: Object.values(countData).reduce(
            (total, count) => total + Number(count || 0),
            0
          ),
        }
      ),
    [countData]
  );

  async function changeStatus(order, status) {
    if (
      ["rejected", "cancelled"].includes(status) &&
      !window.confirm(
        `${label(status)} order #${order.orderNumber}? This action cannot be undone.`
      )
    ) {
      return;
    }

    setBusy(order.id);
    setError("");
    setNotice("");

    try {
      await api.patch(
        `/restaurant/orders/${order.id}/status`,
        { status }
      );

      setNotice(
        `Order #${order.orderNumber} marked ${label(status)}.`
      );

      setSelected(null);

      await load();

      window.setTimeout(() => setNotice(""), 3500);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }

  async function refundOrder(order, reconcile = false) {
    let reason;
    if (!reconcile) {
      reason = window.prompt(`Reason for refunding order #${order.orderNumber} (full amount ${money(order.total)}):`);
      if (reason === null) return;
      if (reason.trim().length < 3) {
        setError("Enter a refund reason with at least 3 characters.");
        return;
      }
      if (!window.confirm(`Submit a full Razorpay refund of ${money(order.total)} for order #${order.orderNumber}?`)) return;
    }
    setBusy(order.id);
    setError("");
    setNotice("");
    try {
      const response = reconcile
        ? await api.get(`/restaurant/orders/${order.id}/refund`)
        : await api.post(`/restaurant/orders/${order.id}/refund`, { reason: reason.trim() });
      setNotice(response.data?.message || `Refund status: ${label(response.data?.data?.status)}.`);
      await load();
      window.setTimeout(() => setNotice(""), 5000);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }

  async function openDeliveryAssignment(order) {
    setAssignmentOrder(order);
    setEligibleStaff([]);
    setAssignmentStaffId("");
    setAssignmentError("");
    setAssignmentLoading(true);
    try {
      const response = await api.get(`/restaurant/delivery/orders/${order.id}/eligible-staff`, {
        params: { restaurantId: activeMembership?.restaurantId },
      });
      const rows = Array.isArray(response.data?.staff) ? response.data.staff : [];
      const currentEmployeeId = order.deliveryAssignment?.employee?.id;
      const choices = rows.filter((employee) => employee.eligible && employee.id !== currentEmployeeId);
      setEligibleStaff(choices);
      setAssignmentStaffId(choices[0]?.id || "");
      if (!choices.length) setAssignmentError("No active delivery associate assigned to this branch is currently available.");
    } catch (requestError) {
      setAssignmentError(message(requestError));
    } finally {
      setAssignmentLoading(false);
    }
  }

  async function saveDeliveryAssignment() {
    if (!assignmentOrder || !assignmentStaffId) return;
    const activeAssignmentStatuses = ["pending_acceptance", "accepted", "arriving_at_restaurant", "picked_up", "on_the_way"];
    const currentAssignment = assignmentOrder.deliveryAssignment;
    if (currentAssignment && activeAssignmentStatuses.includes(currentAssignment.status) && !window.confirm(`Reassign order #${assignmentOrder.orderNumber}? The previous assignment will remain in delivery history.`)) return;
    setAssignmentSaving(true);
    setAssignmentError("");
    setError("");
    try {
      await api.post(`/restaurant/delivery/orders/${assignmentOrder.id}/assignments`, {
        restaurantMemberId: assignmentStaffId,
      }, { params: { restaurantId: activeMembership?.restaurantId } });
      const staff = eligibleStaff.find((employee) => employee.id === assignmentStaffId);
      setNotice(`Delivery assigned to ${staff?.fullName || "the selected associate"}.`);
      setAssignmentOrder(null);
      await load();
    } catch (requestError) {
      setAssignmentError(message(requestError));
    } finally {
      setAssignmentSaving(false);
    }
  }

  function resetFilters() {
    setPage(1);
    setFilter("all");
    setSearch("");
    setBranchId("");
    setFrom("");
    setTo("");
    setSelected(null);
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1440px] space-y-5 pb-8">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium tracking-wide text-orange-600">
            Restaurant workspace / Operations
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            Orders
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage and track your restaurant orders.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 sm:self-auto"
        >
          <RefreshCw
            size={15}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </header>

      {/* Notifications */}
      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          <Check size={16} />
          {notice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={load}
            className="shrink-0 text-sm font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Status overview */}
      <section
        className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7"
        aria-label="Order counts"
      >
        {[
          ["All orders", "all"],
          ["New", "pending"],
          ["Accepted", "accepted"],
          ["Preparing", "preparing"],
          ["Ready", "ready"],
          ["Completed", "completed"],
          ["Cancelled", "cancelled"],
        ].map(([title, key]) => (
          <button
            type="button"
            key={key}
            onClick={() => {
              setPage(1);
              setFilter(key);
              setSelected(null);
            }}
            className={`min-w-0 rounded-xl border bg-white p-4 text-left transition hover:border-orange-200 ${
              filter === key
                ? "border-orange-300 bg-orange-50/50"
                : "border-slate-200"
            }`}
          >
            <p className="text-xs font-medium text-slate-500">
              {title}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-800">
              {loading ? "—" : counts[key] || 0}
            </p>
            {filter === key && (
              <div className="mt-2 h-0.5 w-7 rounded-full bg-orange-500" />
            )}
          </button>
        ))}
      </section>

      {/* Main orders panel */}
      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              Order history
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              View order information and update order status.
            </p>
          </div>

          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {error ? "Orders unavailable" : `${pagination.total} orders`}
          </span>
        </div>

        {/* Filters */}
        <div className="grid min-w-0 gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="relative sm:col-span-2 xl:col-span-2">
            <span className="sr-only">Search orders</span>
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
                setSelected(null);
              }}
              placeholder="Search order, customer or phone"
              className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </label>

          <label>
            <span className="sr-only">Filter by branch</span>
            <select
              value={branchId}
              onChange={(e) => {
                setPage(1);
                setBranchId(e.target.value);
                setSelected(null);
              }}
              className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="relative">
            <CalendarDays
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              aria-label="From date"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
                setSelected(null);
              }}
              className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white pl-9 pr-2 text-sm text-slate-600 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </label>

          <label className="relative">
            <CalendarDays
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              aria-label="To date"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
                setSelected(null);
              }}
              className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white pl-9 pr-2 text-sm text-slate-600 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </label>

          {(search || branchId || from || to || filter !== "all") && (
            <div className="sm:col-span-2 xl:col-span-5">
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700"
              >
                <X size={14} />
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Orders */}
        {loading ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-xl bg-slate-100"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            title="No orders found"
            description="Try changing your filters or search for another order."
          />
        ) : (
          <div className="grid items-start gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                busy={busy === order.id}
                expanded={selected?.id === order.id}
                onOpen={() =>
                  setSelected((current) =>
                    current?.id === order.id ? null : order
                  )
                }
                onAction={changeStatus}
                canRefund={canRefund}
                onRefund={refundOrder}
                onAssign={openDeliveryAssignment}
                canCreateDeliveryAssignment={canCreateDeliveryAssignment}
                canReassignDelivery={canReassignDelivery}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && pagination.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-4">
            <p className="text-sm text-slate-500">
              Page {pagination.page} of {pagination.totalPages}
              <span className="mx-2 text-slate-300">·</span>
              {pagination.total} orders
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => {
                  setSelected(null);
                  setPage((value) => value - 1);
                }}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={16} />
                Previous
              </button>

              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => {
                  setSelected(null);
                  setPage((value) => value + 1);
                }}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
      {assignmentOrder && <DeliveryAssignmentDialog
        order={assignmentOrder}
        staff={eligibleStaff}
        selectedStaffId={assignmentStaffId}
        loading={assignmentLoading}
        saving={assignmentSaving}
        error={assignmentError}
        onSelect={setAssignmentStaffId}
        onAssign={saveDeliveryAssignment}
        onClose={() => setAssignmentOrder(null)}
      />}
    </div>
  );
}

function OrderCard({ order, busy, expanded, onOpen, onAction, canRefund, onRefund, onAssign, canCreateDeliveryAssignment, canReassignDelivery }) {
  const nextStatus = {
    pending: "accepted",
    accepted: "preparing",
    preparing: "ready",
    ready: "completed",
  }[order.status];
  const next = order.orderType === "delivery" && nextStatus === "completed" ? null : nextStatus;

  const items = Array.isArray(order.items) ? order.items : [];

  const blocked =
    order.paymentMethod === "razorpay" &&
    order.paymentStatus !== "paid" &&
    order.status === "pending";
  const deliveryAssignment = order.deliveryAssignment;
  const activeDeliveryStatuses = ["pending_acceptance", "accepted", "arriving_at_restaurant", "picked_up", "on_the_way"];
  const hasActiveDeliveryAssignment = deliveryAssignment && activeDeliveryStatuses.includes(deliveryAssignment.status);
  const terminalOrder = ["completed", "cancelled", "rejected"].includes(order.status);
  const canAssignInitialDelivery = order.orderType === "delivery" && order.status === "ready" && !terminalOrder && !deliveryAssignment && canCreateDeliveryAssignment;
  const canAssignAgain = order.orderType === "delivery" && order.status === "ready" && !terminalOrder && deliveryAssignment && !hasActiveDeliveryAssignment && canCreateDeliveryAssignment;
  const canReassign = order.orderType === "delivery" && order.status === "ready" && !terminalOrder && hasActiveDeliveryAssignment && canReassignDelivery;

  return (
    <article
      className={`min-w-0 overflow-hidden rounded-xl border bg-white transition ${
        expanded
          ? "border-orange-300 shadow-sm"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      {/* Order summary */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-400">
              Order ID
            </p>
            <h3 className="mt-1 break-all text-base font-bold text-slate-800">
              #{order.orderNumber}
            </h3>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className="mt-4">
          <p className="truncate text-sm font-semibold text-slate-800">
            {order.customerName || "Customer"}
          </p>
          {order.customerPhone && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Phone size={12} />
              {order.customerPhone}
            </p>
          )}
        </div>

        <div className="mt-3 space-y-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="shrink-0 text-orange-500" />
            <span className="truncate">
              {order.branch?.name || "Branch not available"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-slate-600">
              {label(order.orderType || "delivery")}
            </span>
            {order.table?.tableNumber && (
              <span className="rounded-md bg-orange-50 px-2.5 py-1.5 text-orange-700">
                Table {order.table.tableNumber}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Clock3 size={13} />
            {dateValue(order.createdAt)}
          </div>
        </div>

        {/* Items preview */}
        <div className="my-4 space-y-3 border-y border-slate-100 py-3">
          {items.slice(0, 3).map((item, index) => (
            <div
              key={item.id || `${item.itemName}-${index}`}
              className="flex min-w-0 items-center gap-3"
            >
              {item.menuItem?.imageUrl ? (
                <img
                  src={item.menuItem.imageUrl}
                  alt={item.itemName || "Menu item"}
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                  <Package size={17} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">
                  <span className="mr-1 font-normal text-slate-400">
                    {quantity(item.quantity)}
                  </span>
                  {item.itemName || "Menu item"}
                </p>
                {item.variantName && (
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {item.variantName}
                  </p>
                )}
              </div>

              <span className="shrink-0 text-sm font-medium tabular-nums text-slate-600">
                {money(item.lineTotal)}
              </span>
            </div>
          ))}

          {items.length > 3 && (
            <p className="text-xs font-medium text-orange-600">
              + {items.length - 3} more items
            </p>
          )}

          {items.length === 0 && (
            <p className="text-xs text-slate-400">
              No item details available.
            </p>
          )}
        </div>

        {/* Total and details */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-400">
              {label(order.paymentMethod || "Payment")} ·{" "}
              <span
                className={
                  order.paymentStatus === "paid"
                    ? "font-medium text-emerald-600"
                    : "font-medium text-slate-500"
                }
              >
                {label(order.paymentStatus || "Pending")}
              </span>
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
              {money(order.total)}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpen}
            aria-expanded={expanded}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition ${
              expanded
                ? "bg-orange-50 text-orange-700"
                : "border border-slate-200 text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
            }`}
          >
            {expanded ? "Hide details" : "Details"}
            {expanded ? <ChevronUp size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* Status action */}
        {next && (
          <button
            type="button"
            disabled={busy || blocked}
            title={
              blocked
                ? "Online payment must be verified before acceptance."
                : undefined
            }
            onClick={() => onAction(order, next)}
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            {busy
              ? "Updating..."
              : blocked
                ? "Awaiting verified payment"
                : `${label(next)} order`}
          </button>
        )}

        {order.status === "pending" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(order, "rejected")}
            className="mt-2 min-h-9 w-full rounded-lg text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
          >
            Reject order
          </button>
        )}

        {order.orderType === "delivery" && deliveryAssignment && <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">Delivery associate</p><p className="mt-1 truncate text-sm font-semibold text-slate-800">{deliveryAssignment.employee?.fullName || "Associate unavailable"}</p>{deliveryAssignment.employee?.phone && <a href={`tel:${deliveryAssignment.employee.phone}`} className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600"><Phone size={12}/>{deliveryAssignment.employee.phone}</a>}</div><DeliveryStatusBadge status={deliveryAssignment.status}/></div>
          {deliveryAssignment.notes && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{deliveryAssignment.notes}</p>}
        </div>}
        {(canAssignInitialDelivery || canAssignAgain || canReassign) && <button type="button" disabled={busy} onClick={() => onAssign(order)} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-800 transition hover:bg-orange-100 disabled:opacity-50"><Truck size={16}/>{canReassign ? "Reassign delivery" : canAssignAgain ? "Assign another associate" : "Assign delivery"}</button>}
      </div>

      {/* Inline order details */}
      {expanded && (
        <div className="border-t border-orange-100 bg-slate-50/70 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800">
              Order details
            </h4>
            <button
              type="button"
              onClick={onOpen}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DetailInfo icon={Phone} title="Customer">
              <p className="font-semibold">
                {order.customerName || "Customer"}
              </p>
              {order.customerPhone && (
                <p className="mt-1 text-xs font-normal text-slate-500">
                  {order.customerPhone}
                </p>
              )}
            </DetailInfo>

            <DetailInfo icon={Package} title="Order type">
              {label(order.orderType || "delivery")}
              {order.table?.tableNumber && (
                <p className="mt-1 text-xs font-normal text-slate-500">
                  Table {order.table.tableNumber}
                </p>
              )}
            </DetailInfo>

            <DetailInfo icon={MapPin} title="Branch">
              {order.branch?.name || "Branch not available"}
            </DetailInfo>

            <DetailInfo icon={CreditCard} title="Payment">
              <p>{label(order.paymentMethod || "Not specified")}</p>
              <p
                className={`mt-1 text-xs ${
                  order.paymentStatus === "paid"
                    ? "text-emerald-600"
                    : "text-slate-500"
                }`}
              >
                {label(order.paymentStatus || "Pending")}
              </p>
              {order.refund && <p className="mt-1 text-xs font-semibold text-blue-700">Refund {label(order.refund.status)} · {money(order.refund.amount)}</p>}
            </DetailInfo>
          </div>

          {order.orderType === "delivery" && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Delivery address</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{formatDeliveryAddress(order.deliveryAddress) || "Address not available"}</p>{order.customerNotes && <><p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Customer instructions</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{order.customerNotes}</p></>}{deliveryAssignment && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600"><span>Assigned {dateValue(deliveryAssignment.assignedAt)}</span>{deliveryAssignment.acceptedAt && <span>· Accepted {dateValue(deliveryAssignment.acceptedAt)}</span>}{deliveryAssignment.completedAt && <span>· Completed {dateValue(deliveryAssignment.completedAt)}</span>}</div>}</div>}

          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between">
              <h5 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Receipt size={16} className="text-orange-500" />
                All ordered items
              </h5>
              <span className="text-xs font-medium text-slate-400">
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            </div>

            {items.length ? (
              <div className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <div
                    key={item.id || `${item.itemName}-${index}`}
                    className="flex gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    {item.menuItem?.imageUrl ? (
                      <img
                        src={item.menuItem.imageUrl}
                        alt={item.itemName || "Menu item"}
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                        <Package size={19} />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {item.itemName || "Menu item"}
                      </p>
                      {item.variantName && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.variantName}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        Quantity: {Number(item.quantity || 0)}
                      </p>
                      {item.addonsSnapshot?.length > 0 && (
                        <p className="mt-1 text-xs text-slate-500">
                          Add-ons:{" "}
                          {item.addonsSnapshot
                            .map((addon) => addon.name)
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                      {item.itemNotes && (
                        <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                          Note: {item.itemNotes}
                        </p>
                      )}
                    </div>

                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
                      {money(item.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No item details available.
              </p>
            )}

            {order.customerNotes && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-600">
                  Customer instructions
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-500">
                  {order.customerNotes}
                </p>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Order total
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {money(order.total)}
                </p>
              </div>
              <StatusBadge status={order.status} />
            </div>
          </div>

          {["pending", "accepted", "preparing"].includes(order.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction(order, "cancelled")}
              className="mt-3 min-h-9 w-full rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            >
              Cancel order
            </button>
          )}
          {canRefund && order.paymentMethod === "razorpay" && order.paymentStatus === "paid" && ["cancelled", "rejected"].includes(order.status) && (
            order.refund?.status === "processed" ? (
              <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Refund processed · {money(order.refund.amount)}</p>
            ) : order.refund?.status === "failed" ? (
              <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Razorpay could not process this refund. Contact platform support before retrying.</p>
            ) : (
              <button type="button" disabled={busy} onClick={() => onRefund(order, Boolean(order.refund))} className="mt-3 min-h-10 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 disabled:opacity-50">
                {busy ? "Processing…" : order.refund ? `Check refund status (${label(order.refund.status)})` : `Issue full refund · ${money(order.total)}`}
              </button>
            )
          )}
        </div>
      )}
    </article>
  );
}

function DetailInfo({ icon: Icon, title, children }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
        <Icon size={13} />
        {title}
      </p>
      <div className="mt-2 break-words text-sm font-medium text-slate-700">
        {children}
      </div>
    </div>
  );
}

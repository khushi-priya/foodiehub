import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../services/api";
import { connectDeliverySocket } from "../../../services/socket";
import { useAuth } from "../../../context/AuthContext";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  PackageCheck,
  Phone,
  Search,
  Truck,
  UserRound,
  X,
} from "lucide-react";

const input =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50";
const filters = [
  ["", "All delivery orders"],
  ["pending_assignment", "Pending assignment"],
  ["assigned", "Assigned"],
  ["accepted", "Accepted"],
  ["preparing", "Preparing"],
  ["ready_for_pickup", "Ready for pickup"],
  ["picked_up", "Picked up"],
  ["on_the_way", "On the way"],
  ["delivered", "Delivered"],
  ["failed", "Failed"],
  ["cancelled", "Cancelled"],
];
const errorText = (error) =>
  error.response?.data?.message || "Something went wrong. Please try again.";
const money = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
const dateTime = (value) => (value ? new Date(value).toLocaleString() : "—");
const statusLabel = (status) =>
  ({
    pending_acceptance: "Assigned",
    ready: "Ready for pickup",
    completed: "Completed",
    on_the_way: "On the way",
  })[status] || String(status || "Pending").replaceAll("_", " ");
const statusClass = (status) =>
  ["delivered", "completed"].includes(status)
    ? "bg-emerald-50 text-emerald-700"
    : ["failed", "cancelled", "rejected"].includes(status)
      ? "bg-rose-50 text-rose-700"
      : ["accepted", "picked_up", "on_the_way", "ready", "preparing"].includes(
            status,
          )
        ? "bg-orange-50 text-orange-700"
        : "bg-slate-100 text-slate-600";

export default function RestaurantDeliveryOrders() {
  const { user } = useAuth();
  const membership = useMemo(
    () =>
      (user?.restaurantMemberships || []).find(
        (item) =>
          item.status === "active" &&
          (item.role?.code === "restaurant_owner" ||
            item.role?.permissions?.some(
              (permission) =>
                (typeof permission === "string"
                  ? permission
                  : permission.code) === "delivery_orders.view",
            )),
      ),
    [user],
  );
  const rolePermissions = (membership?.role?.permissions || []).map((item) =>
    typeof item === "string" ? item : item.code,
  );
  const canAssign =
    rolePermissions.includes("delivery_assignments.create") ||
    rolePermissions.includes("delivery_assignments.reassign");
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [staff, setStaff] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [autoAssignmentEnabled, setAutoAssignmentEnabled] = useState(false);
  const [savingAutoSetting, setSavingAutoSetting] = useState(false);
  const [locationSharingEnabled, setLocationSharingEnabled] = useState(false);
  const [savingLocationSetting, setSavingLocationSetting] = useState(false);

  const load = useCallback(
    async (page = 1) => {
      if (!membership?.restaurantId) return;
      setLoading(true);
      setError("");
      try {
        const params = {
          restaurantId: membership.restaurantId,
          page,
          pageSize: 20,
          search: search || undefined,
          status: status || undefined,
          branchId: branchId || undefined,
        };
        const [orderResponse, branchResponse] = await Promise.all([
          api.get("/restaurant/delivery/orders", { params }),
          api.get("/restaurant/delivery/orders/branches", {
            params: { restaurantId: membership.restaurantId },
          }),
        ]);
        setOrders(orderResponse.data.orders || []);
        setPagination(
          orderResponse.data.pagination || { page: 1, totalPages: 1, total: 0 },
        );
        setBranches(branchResponse.data.branches || []);
        const settingResponse = await api.get("/restaurant/delivery/settings", {
          params: {
            restaurantId: membership.restaurantId,
            branchId: branchId || undefined,
          },
        });
        setAutoAssignmentEnabled(
          Boolean(settingResponse.data.settings?.automaticAssignmentEnabled),
        );
      setLocationSharingEnabled(Boolean(settingResponse.data.settings?.locationSharingEnabled));
      } catch (requestError) {
        setError(errorText(requestError));
      } finally {
        setLoading(false);
      }
    },
    [membership, search, status, branchId],
  );

  const toggleAutoAssignment = async (event) => {
    const enabled = event.target.checked;
    setSavingAutoSetting(true);
    try {
      await api.patch(
        "/restaurant/delivery/settings",
        { automaticAssignmentEnabled: enabled, branchId: branchId || null },
        { params: { restaurantId: membership.restaurantId } },
      );
      setAutoAssignmentEnabled(enabled);
      setNotice(
        `Automatic assignment ${enabled ? "enabled" : "disabled"}${branchId ? " for this branch" : " for the restaurant"}.`,
      );
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSavingAutoSetting(false);
    }
  };

  const toggleLocationSharing = async (event) => {
    const enabled = event.target.checked;
    setSavingLocationSetting(true);
    try {
      await api.patch('/restaurant/delivery/settings', { locationSharingEnabled: enabled, branchId: branchId || null }, { params: { restaurantId: membership.restaurantId } });
      setLocationSharingEnabled(enabled);
      setNotice(`Employee location sharing ${enabled ? 'enabled' : 'disabled'}${branchId ? ' for this branch' : ' for the restaurant'}.`);
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setSavingLocationSetting(false); }
  };

  const autoAssign = async () => {
    if (!detail || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await api.post(
        `/restaurant/delivery/orders/${detail.id}/auto-assign`,
        {},
        { params: { restaurantId: membership.restaurantId } },
      );
      setNotice(response.data.message || "Order automatically assigned.");
      setDetail(null);
      await load(pagination.page);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) load(1);
    });
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(
    () =>
      connectDeliverySocket((event, payload) => {
        if (event === "delivery:no-eligible-staff")
          setNotice(
            "A delivery order has no eligible employee available and remains pending assignment.",
          );
        if (detail?.id && payload?.orderId === detail.id) {
          api.get(`/restaurant/delivery/orders/${detail.id}`, { params: { restaurantId: membership?.restaurantId } })
            .then((response) => setDetail(response.data.order))
            .catch(() => {});
        }
        load(pagination.page);
      }),
    [detail?.id, load, membership?.restaurantId, pagination.page],
  );

  const openDetails = async (orderId) => {
    setError("");
    setStaff([]);
    setSelectedStaff("");
    try {
      const response = await api.get(`/restaurant/delivery/orders/${orderId}`, {
        params: { restaurantId: membership?.restaurantId },
      });
      setDetail(response.data.order);
    } catch (requestError) {
      setError(errorText(requestError));
    }
  };

  const loadEligibleStaff = async () => {
    if (!detail || !membership?.restaurantId) return;
    setLoadingStaff(true);
    setError("");
    try {
      const response = await api.get(
        `/restaurant/delivery/orders/${detail.id}/eligible-staff`,
        { params: { restaurantId: membership.restaurantId } },
      );
      setStaff(response.data.staff || []);
      setSelectedStaff("");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoadingStaff(false);
    }
  };

  const assignStaff = async (event) => {
    event.preventDefault();
    if (!selectedStaff || !detail || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.post(
        `/restaurant/delivery/orders/${detail.id}/assignments`,
        { restaurantMemberId: selectedStaff },
        { params: { restaurantId: membership.restaurantId } },
      );
      setNotice("Delivery employee assigned.");
      setDetail(null);
      setStaff([]);
      await load(pagination.page);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-orange-600">
            Delivery Management
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
            Delivery Orders
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review delivery orders, assignment status, and delivery history for
            your authorized branches.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">
          {pagination.total} orders
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
          <button
            type="button"
            onClick={() => load(pagination.page)}
            className="shrink-0 font-semibold"
          >
            Retry
          </button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
          <button
            type="button"
            className="float-right font-semibold"
            onClick={() => setNotice("")}
          >
            Dismiss
          </button>
        </p>
      )}
      {canAssign && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <span>
            <strong className="block text-slate-900">
              Automatic delivery assignment
            </strong>
            <span className="text-xs text-slate-500">
              {branchId
                ? "Applies to the selected branch."
                : "Applies to the restaurant default."}
            </span>
          </span>
          <input
            type="checkbox"
            checked={autoAssignmentEnabled}
            disabled={savingAutoSetting}
            onChange={toggleAutoAssignment}
            className="h-5 w-5 accent-orange-500"
          />
        </label>
        <label className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <span><strong className="block text-slate-900">Delivery employee location sharing</strong><span className="text-xs text-slate-500">Live location is available only during active assigned deliveries.</span></span>
          <input type="checkbox" checked={locationSharingEnabled} disabled={savingLocationSetting} onChange={toggleLocationSharing} className="h-5 w-5 accent-orange-500" />
        </label>
        </div>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative lg:col-span-2">
            <span className="sr-only">Search delivery orders</span>
            <Search
              size={15}
              className="absolute left-3 top-4 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order, customer or phone"
              className={`${input} pl-9`}
            />
          </label>
          <select
            aria-label="Filter by branch"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className={input}
          >
            <option value="">All authorized branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by delivery status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={input}
          >
            {filters.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <LoaderCircle size={18} className="animate-spin" />
              Loading delivery orders…
            </div>
          ) : orders.length ? (
            orders.map((order) => (
              <article
                key={order.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-slate-900">
                      {order.orderNumber}
                    </h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusClass(order.assignment?.status || order.status)}`}
                    >
                      {statusLabel(order.assignment?.status || order.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    {order.customerName} · {money(order.total)}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {order.branch?.name || "Branch"} · {order.deliveryAddress}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {order.assignment?.employee
                      ? `Assigned to ${order.assignment.employee.fullName}`
                      : "Pending assignment"}{" "}
                    · {dateTime(order.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openDetails(order.id)}
                  className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  View details
                </button>
              </article>
            ))
          ) : (
            <div className="py-12 text-center">
              <PackageCheck size={28} className="mx-auto text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">
                No delivery orders found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Orders with delivery service and a delivery address will appear
                here.
              </p>
            </div>
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>
            Page {pagination.page} of {Math.max(1, pagination.totalPages)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous page"
              disabled={pagination.page <= 1 || loading}
              onClick={() => load(pagination.page - 1)}
              className="rounded-lg border p-2 disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => load(pagination.page + 1)}
              className="rounded-lg border p-2 disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </footer>
      </section>

      {detail && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setDetail(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-order-detail-title"
            className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
                  Delivery Order
                </p>
                <h2
                  id="delivery-order-detail-title"
                  className="mt-1 text-xl font-extrabold text-slate-900"
                >
                  {detail.orderNumber}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {money(detail.total)} · {dateTime(detail.createdAt)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close order details"
                onClick={() => setDetail(null)}
                className="rounded-lg border p-2"
              >
                <X size={17} />
              </button>
            </header>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <section className="rounded-xl bg-slate-50 p-4">
                <h3 className="font-bold text-slate-800">Customer</h3>
                <p className="mt-2 text-sm text-slate-700">
                  {detail.customerName}
                </p>
                {detail.customerPhone && (
                  <a
                    href={`tel:${detail.customerPhone}`}
                    className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-orange-700"
                  >
                    <Phone size={14} />
                    {detail.customerPhone}
                  </a>
                )}
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  Delivery address
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {detail.deliveryAddress || "No delivery address recorded."}
                </p>
                {detail.customerNotes && (
                  <p className="mt-3 text-xs text-slate-500">
                    Note: {detail.customerNotes}
                  </p>
                )}
              </section>
              <section className="rounded-xl bg-slate-50 p-4">
                <h3 className="font-bold text-slate-800">
                  Branch & preparation
                </h3>
                <p className="mt-2 text-sm text-slate-700">
                  {detail.branch?.name || "Branch"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Order status:{" "}
                  <span className="font-semibold capitalize">
                    {statusLabel(detail.status)}
                  </span>
                </p>
                <div className="mt-3 border-t border-slate-200 pt-3">
                  {detail.assignment?.employee ? (
                    <>
                      <p className="text-xs font-semibold text-slate-500">
                        Assigned delivery employee
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {detail.assignment.employee.fullName}
                      </p>
                      {detail.assignment.employee.phone && (
                        <a
                          href={`tel:${detail.assignment.employee.phone}`}
                          className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-orange-700"
                        >
                          <Phone size={14} />
                          {detail.assignment.employee.phone}
                        </a>
                      )}
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {statusLabel(detail.assignment.status)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      No delivery employee assigned.
                    </p>
                  )}
                  {detail.liveLocation && (
                    <a href={`https://www.google.com/maps?q=${detail.liveLocation.latitude},${detail.liveLocation.longitude}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                      <Truck size={14} /> View employee live location · {dateTime(detail.liveLocation.capturedAt)}
                    </a>
                  )}
                </div>
              </section>
            </div>
            {canAssign && (
              <section className="mt-5 rounded-xl border border-orange-100 bg-orange-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      {detail.assignment
                        ? "Reassign delivery"
                        : "Assign delivery employee"}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Eligible employees must be active, online, and assigned to
                      this branch.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={loadEligibleStaff}
                      disabled={loadingStaff}
                      className={button}
                    >
                      {loadingStaff ? (
                        <LoaderCircle size={15} className="animate-spin" />
                      ) : (
                        <UserRound size={15} />
                      )}
                      Find eligible staff
                    </button>
                    {autoAssignmentEnabled && !detail.assignment && (
                      <button
                        type="button"
                        onClick={autoAssign}
                        disabled={saving}
                        className="min-h-10 rounded-xl border border-orange-300 px-4 text-sm font-bold text-orange-800"
                      >
                        Auto assign
                      </button>
                    )}
                  </div>
                </div>
                {staff.length > 0 && (
                  <form
                    onSubmit={assignStaff}
                    className="mt-3 flex flex-col gap-2 sm:flex-row"
                  >
                    <select
                      required
                      value={selectedStaff}
                      onChange={(event) => setSelectedStaff(event.target.value)}
                      className={`${input} mt-0 flex-1`}
                    >
                      <option value="">Select delivery employee</option>
                      {staff.map((employee) => (
                        <option
                          disabled={!employee.eligible}
                          key={employee.id}
                          value={employee.id}
                        >
                          {employee.fullName}
                          {employee.employeeId
                            ? ` · ${employee.employeeId}`
                            : ""}{" "}
                          · {employee.role} · {employee.availabilityStatus} ·
                          workload {employee.currentWorkload}/
                          {employee.workloadLimit}
                          {employee.ineligibleReason
                            ? ` · ${employee.ineligibleReason}`
                            : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!selectedStaff || saving}
                      className={button}
                    >
                      {saving ? (
                        <LoaderCircle size={15} className="animate-spin" />
                      ) : (
                        <Truck size={15} />
                      )}
                      Assign
                    </button>
                  </form>
                )}
                {!loadingStaff && staff.length === 0 && (
                  <p className="mt-3 text-xs text-slate-600">
                    No delivery employees are assigned to this branch.
                  </p>
                )}
              </section>
            )}

            <section className="mt-5">
              <h3 className="font-bold text-slate-900">Delivery history</h3>
              {detail.history?.length ? (
                <ol className="mt-3 space-y-3">
                  {detail.history.map((entry) => (
                    <li key={entry.id} className="flex gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                        <Clock3 size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {String(entry.event).replaceAll("_", " ")}
                          {entry.toStatus
                            ? ` · ${statusLabel(entry.toStatus)}`
                            : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {dateTime(entry.createdAt)}
                          {entry.performer
                            ? ` · ${[entry.performer.firstName, entry.performer.lastName].filter(Boolean).join(" ")}`
                            : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                  <AlertCircle size={15} />
                  No delivery status history recorded.
                </p>
              )}
            </section>
          </section>
        </div>
      )}
    </main>
  );
}

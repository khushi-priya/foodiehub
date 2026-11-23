import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../services/api";
import { connectDeliverySocket } from "../../../services/socket";
import { useAuth } from "../../../context/AuthContext";
import { getDeliveryMembership } from "../deliveryAccess";
import {
  Check,
  Clock3,
  ExternalLink,
  LogOut,
  LoaderCircle,
  MapPin,
  PackageCheck,
  Phone,
  Power,
  RefreshCw,
  Truck,
} from "lucide-react";

const errorText = (error) =>
  error.response?.data?.message || "Something went wrong. Please try again.";
const dateTime = (value) => (value ? new Date(value).toLocaleString() : "—");
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusLabel = (status) =>
  ({
    pending_acceptance: "Assignment received",
    arriving_at_restaurant: "Arriving at restaurant",
    at_restaurant: "At restaurant",
    picked_up: "Picked up",
    on_the_way: "On the way",
    at_customer: "At customer",
    delivered: "Delivered",
    rejected: "Declined",
    cancelled: "Cancelled",
    failed: "Failed delivery",
  })[status] || String(status || "").replaceAll("_", " ");
const statusStyle = (status) =>
  ["delivered"].includes(status)
    ? "bg-emerald-50 text-emerald-700"
    : ["failed", "cancelled", "rejected"].includes(status)
      ? "bg-rose-50 text-rose-700"
      : "bg-orange-50 text-orange-700";
const mapsLink = (address) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address || "")}`;
const addonNames = (addons) =>
  (Array.isArray(addons) ? addons : [])
    .map((addon) =>
      typeof addon === "string"
        ? addon
        : addon?.name || addon?.itemName || addon?.optionName,
    )
    .filter(Boolean);

export default function RestaurantDeliveryDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const membership = useMemo(() => getDeliveryMembership(user), [user]);
  const membershipPermissions = (membership?.role?.permissions || []).map(
    (permission) =>
      typeof permission === "string" ? permission : permission.code,
  );
  const canSetAvailability = membershipPermissions.includes(
    "delivery_staff.set_availability",
  );
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actingOn, setActingOn] = useState("");
  const [failedAssignment, setFailedAssignment] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [confirmAssignment, setConfirmAssignment] = useState("");
  const [deliveryOtp, setDeliveryOtp] = useState("");
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const watchId = useRef(null);
  const lastLocationSentAt = useRef(0);

  const load = useCallback(async () => {
    if (!membership?.restaurantId) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/restaurant/delivery/dashboard", {
        params: { restaurantId: membership.restaurantId },
      });
      setDashboard(response.data);
      if (
        !response.data.employee?.locationSharingEnabled &&
        watchId.current != null
      ) {
        navigator.geolocation?.clearWatch(watchId.current);
        watchId.current = null;
        setSharingLocation(false);
      }
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [membership]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) load();
    });
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(
    () =>
      connectDeliverySocket((event) => {
        if (
          event === "delivery:assignment-updated" ||
          event === "delivery:cash-handover-updated" ||
          event === "delivery:location-cleared"
        )
          load();
      }),
    [load],
  );

  const toggleAvailability = async () => {
    if (!membership?.restaurantId || !dashboard?.employee || saving) return;
    const nextStatus =
      dashboard.employee.availabilityStatus === "available"
        ? "offline"
        : "available";
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api.patch(
        "/restaurant/delivery/me/availability",
        { availabilityStatus: nextStatus },
        { params: { restaurantId: membership.restaurantId } },
      );
      setDashboard((current) => ({
        ...current,
        employee: {
          ...current.employee,
          availabilityStatus: response.data.availabilityStatus,
        },
      }));
      setNotice(
        nextStatus === "available"
          ? "You are now online and available."
          : "You are now offline.",
      );
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };

  const actOnAssignment = async (assignmentId, action, extra = {}) => {
    if (actingOn) return;
    if (action === "reject") {
      if (
        !window.confirm(
          "Decline this delivery assignment? The restaurant will be able to assign it to another associate.",
        )
      )
        return;
      const reason = window.prompt("Why are you declining this delivery?");
      if (reason === null) return;
      if (reason.trim().length < 3) {
        setError("Provide a short reason of at least 3 characters.");
        return;
      }
      extra = { ...extra, reason: reason.trim() };
    }
    setActingOn(assignmentId);
    setError("");
    setNotice("");
    try {
      await api.post(
        `/restaurant/delivery/assignments/${assignmentId}/action`,
        { action, ...extra },
        { params: { restaurantId: membership.restaurantId } },
      );
      setNotice(
        action === "reject"
          ? "Assignment declined. The restaurant can reassign it."
          : `Delivery updated: ${statusLabel(action)}.`,
      );
      setFailedAssignment("");
      setFailureReason("");
      setConfirmAssignment("");
      setDeliveryOtp("");
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setActingOn("");
    }
  };

  const submitCodCollection = async (delivery, outcome) => {
    if (actingOn) return;
    const reason = outcome === "collection_failed" ? window.prompt("Why could the cash not be collected?") : "";
    if (outcome === "collection_failed" && (reason === null || reason.trim().length < 3)) return;
    if (outcome === "collected" && !window.confirm(`Confirm you collected ${money(delivery.codExpectedAmount)} in cash from the customer?`)) return;
    const requestKey = globalThis.crypto?.randomUUID?.();
    if (!requestKey) { setError("Secure collection confirmation is unavailable in this browser."); return; }
    setActingOn(delivery.assignmentId); setError(""); setNotice("");
    try {
      await api.post(`/restaurant/delivery/assignments/${delivery.assignmentId}/cod-collection`, {
        outcome,
        ...(outcome === "collected" ? { amount: delivery.codExpectedAmount } : { reason: reason.trim() }),
        requestKey,
      }, { params: { restaurantId: membership.restaurantId } });
      setNotice(outcome === "collected" ? "Cash collection recorded. Hand it over to restaurant staff for reconciliation." : "Cash collection issue recorded.");
      await load();
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setActingOn(""); }
  };

  const submitCashHandover = async (branch) => {
    const ready = dashboard?.cashReadyByBranch?.find((item) => item.branchId === branch.id);
    const amount = Number(ready?.totalAmount || 0);
    if (amount <= 0) { setError(`There is no collected COD cash ready for handover at ${branch.name}.`); return; }
    if (!window.confirm(`Submit ${money(amount)} from ${ready.orders.length} actually collected COD order(s) for ${branch.name}? A restaurant receiver must verify it.`)) return;
    const idempotencyKey = globalThis.crypto?.randomUUID?.();
    if (!idempotencyKey) { setError("Secure cash handover submission is unavailable in this browser."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await api.post("/restaurant/delivery/me/cash-handovers", { branchId: branch.id, amount: amount.toFixed(2), idempotencyKey }, { params: { restaurantId: membership.restaurantId } });
      setNotice(`Cash handover submitted. Expected cash: ${money(response.data.data.expectedAmount)}. Awaiting receiver verification.`);
      await load();
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setSaving(false); }
  };

  const stopLocationSharing = async () => {
    if (watchId.current != null && navigator.geolocation)
      navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharingLocation(false);
    try {
      await api.delete("/restaurant/delivery/me/location", {
        params: { restaurantId: membership.restaurantId },
      });
      setDashboard((current) =>
        current
          ? {
              ...current,
              employee: { ...current.employee, locationSharingActive: false },
            }
          : current,
      );
      setLocationError("");
    } catch (requestError) {
      setLocationError(errorText(requestError));
    }
  };

  const startLocationSharing = () => {
    if (!navigator.geolocation) {
      setLocationError("Location access is not available in this browser.");
      return;
    }
    if (watchId.current != null) return;
    setLocationError("");
    watchId.current = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        if (now - lastLocationSentAt.current < 8000) return;
        lastLocationSentAt.current = now;
        try {
          await api.patch(
            "/restaurant/delivery/me/location",
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracyMeters: position.coords.accuracy,
            },
            { params: { restaurantId: membership.restaurantId } },
          );
          setDashboard((current) =>
            current
              ? {
                  ...current,
                  employee: {
                    ...current.employee,
                    locationSharingActive: true,
                  },
                }
              : current,
          );
          setLocationError("");
        } catch (requestError) {
          if (watchId.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null;
          setSharingLocation(false);
          setDashboard((current) => current ? { ...current, employee: { ...current.employee, locationSharingActive: false } } : current);
          setLocationError(errorText(requestError));
          try { await api.delete("/restaurant/delivery/me/location", { params: { restaurantId: membership.restaurantId } }); } catch {}
        }
      },
      async (geoError) => {
        if (watchId.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
        setSharingLocation(false);
        setDashboard((current) => current ? { ...current, employee: { ...current.employee, locationSharingActive: false } } : current);
        setLocationError(geoError.message || "Location permission was not granted. Location sharing is off.");
        try { await api.delete("/restaurant/delivery/me/location", { params: { restaurantId: membership.restaurantId } }); } catch {}
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    setSharingLocation(true);
  };

  const signOut = async () => {
    try {
      if (watchId.current != null) await stopLocationSharing();
      await logout();
    } finally {
      navigate("/restaurant/login", { replace: true });
    }
  };
  const employee = dashboard?.employee;
  const isOnline = employee?.availabilityStatus === "available";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
              <Truck size={21} />
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-slate-900">
                FoodieHub Delivery
              </p>
              <p className="truncate text-xs text-slate-500">
                Delivery partner workspace
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`hidden rounded-full px-3 py-1.5 text-xs font-bold sm:inline-flex ${isOnline ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
            >
              {isOnline
                ? "ONLINE"
                : employee?.availabilityStatus === "on_delivery"
                  ? "ON DELIVERY"
                  : "OFFLINE"}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 pb-10 sm:px-6 sm:py-8 lg:px-8">
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
            <button
              type="button"
              onClick={load}
              className="inline-flex shrink-0 items-center gap-1 font-semibold"
            >
              <RefreshCw size={14} />
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
          </p>
        )}
        {loading && !employee ? (
          <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-slate-500">
            <LoaderCircle size={19} className="animate-spin" />
            Loading your delivery dashboard…
          </div>
        ) : (
          employee && (
            <>
              <section className="rounded-3xl bg-gradient-to-r from-[#24150e] via-[#382014] to-[#633215] p-5 text-white shadow-lg sm:p-8">
                <div className="flex flex-wrap items-end justify-between gap-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.16em] text-orange-300">
                      Delivery partner dashboard
                    </p>
                    <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
                      Good day, {employee.firstName}
                    </h1>
                    <p className="mt-2 text-sm text-orange-100/80">
                      {employee.role}
                      {employee.employeeId ? ` · ${employee.employeeId}` : ""}
                      {employee.branches?.length
                        ? `  •  ${employee.branches.map((branch) => branch.name).join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={
                      saving ||
                      employee.availabilityStatus === "on_delivery" ||
                      !canSetAvailability
                    }
                    onClick={toggleAvailability}
                    aria-pressed={isOnline}
                    className={`flex min-h-12 min-w-44 items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60 ${isOnline ? "bg-white/10 text-white hover:bg-white/15" : "bg-orange-500 text-white hover:bg-orange-600"}`}
                  >
                    {saving ? (
                      <LoaderCircle size={18} className="animate-spin" />
                    ) : (
                      <Power size={18} />
                    )}
                    {saving
                      ? "Updating…"
                      : isOnline
                        ? "Go offline"
                        : "Go online"}
                  </button>
                </div>
                {!canSetAvailability && (
                  <p className="mt-3 text-xs text-orange-100/80">
                    Your role does not include availability changes.
                  </p>
                )}
                {employee.availabilityStatus === "on_delivery" && (
                  <p className="mt-3 text-xs text-orange-100/80">
                    Availability is managed while you have active deliveries.
                  </p>
                )}
              </section>
              {employee.locationSharingEnabled && (
                <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-slate-900">
                        Live location sharing
                      </h2>
                      <p className="mt-1 max-w-lg text-xs leading-5 text-slate-500">
                        Your location is shared with customers and authorized
                        restaurant staff only while you have active deliveries.
                        Each update expires after two minutes.
                      </p>
                      {employee.locationSharingActive && !sharingLocation && (
                        <p className="mt-1 text-xs font-semibold text-emerald-700">
                          A recent location update is available.
                        </p>
                      )}

          {!!employee.branches?.length && (
            <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div>
                <h2 className="font-bold text-slate-900">Cash handover</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Only cash you confirmed collecting is eligible. A restaurant receiver must verify your handover.</p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {employee.branches.map((branch) => {
                  const ready = dashboard.cashReadyByBranch?.find((item) => item.branchId === branch.id);
                  const branchHandovers = (dashboard.cashHandovers || []).filter((row) => row.branchId === branch.id);
                  const submittedBefore = branchHandovers.reduce((sum, row) => sum + Number(row.submittedAmount || 0), 0);
                  return (
                    <div key={branch.id} className="rounded-xl bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-800">{branch.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{ready?.orders?.length || 0} COD orders · {money(ready?.totalAmount || 0)} actually collected and ready</p>
                          <p className="mt-1 text-xs text-slate-500">Recent handovers submitted: {money(submittedBefore)}</p>
                        </div>
                        <button disabled={saving || !(ready?.totalAmount > 0)} onClick={() => submitCashHandover(branch)} className="min-h-10 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Submit handover</button>
                      </div>
                      {ready?.orders?.length > 0 && <p className="mt-2 text-xs text-slate-500">Orders: {ready.orders.map((item) => `${item.orderNumber} (${money(item.amount)})`).join(", ")}</p>}
                      {branchHandovers.some((row) => row.status === "pending") && <p className="mt-2 text-xs font-semibold text-amber-700">A previous handover is awaiting verification.</p>}
                    </div>
                  );
                })}
              </div>
              {dashboard.cashHandovers?.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Recent handovers</p>
                  <div className="space-y-2">
                    {dashboard.cashHandovers.slice(0, 5).map((handover) => {
                      const received = handover.receivedAmount == null ? null : Number(handover.receivedAmount);
                      const submitted = Number(handover.submittedAmount || 0);
                      return (
                        <div key={handover.id} className="grid gap-1 rounded-lg border border-slate-100 p-2 text-xs sm:grid-cols-2">
                          <span className="text-slate-600">{handover.branch?.name} · {dateTime(handover.submittedAt)}</span>
                          <span className="font-bold capitalize text-slate-700">{handover.status}</span>
                          <span className="text-slate-500">Expected {money(handover.expectedAmount)} · Submitted {money(submitted)}</span>
                          <span className="text-slate-500">{received == null ? "Received pending" : `Received ${money(received)} · Difference ${money(received - submitted)}`}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}
                    </div>
                    <button
                      type="button"
                      onClick={
                        sharingLocation
                          ? stopLocationSharing
                          : startLocationSharing
                      }
                      disabled={
                        !sharingLocation &&
                        !["available", "on_delivery"].includes(
                          employee.availabilityStatus,
                        )
                      }
                      className={`min-h-11 rounded-xl px-4 text-sm font-bold ${sharingLocation ? "border border-slate-200 text-slate-700" : "bg-emerald-600 text-white"} disabled:opacity-50`}
                    >
                      {sharingLocation ? "Stop sharing" : "Share my location"}
                    </button>
                  </div>
                  {locationError && (
                    <p role="alert" className="mt-3 text-xs text-rose-700">
                      {locationError}
                    </p>
                  )}
                </section>
              )}
              {/* \n\n{" "} */}
              <section className="mt-5">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-orange-600">
                      Today
                    </p>
                    <h2 className="mt-1 text-lg font-extrabold text-slate-900">
                      Your delivery activity
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 disabled:opacity-50"
                  >
                    <RefreshCw
                      size={13}
                      className={loading ? "animate-spin" : ""}
                    />
                    Refresh
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ["Assigned today", dashboard.counts?.today],
                    ["Pending acceptance", dashboard.counts?.pendingAcceptance],
                    ["Accepted", dashboard.counts?.accepted],
                    ["Ready for pickup", dashboard.counts?.awaitingPickup],
                    ["Active deliveries", dashboard.counts?.active],
                    ["Completed", dashboard.counts?.completed],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <p className="text-xs font-semibold text-slate-500">
                        {label}
                      </p>
                      <p className="mt-1 text-2xl font-extrabold text-slate-900">
                        {value ?? "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="mt-8">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                    <PackageCheck size={19} />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900">
                      Current deliveries
                    </h2>
                    <p className="text-sm text-slate-500">
                      Your active assignments, pickup details and delivery
                      steps.
                    </p>
                  </div>
                </div>
                {dashboard.deliveries?.length ? (
                  <div className="space-y-4">
                    {dashboard.deliveries.map((delivery) => {
                      const terminal = [
                        "delivered",
                        "failed",
                        "cancelled",
                        "rejected",
                      ].includes(delivery.deliveryStatus);
                      const customerMap = mapsLink(
                        delivery.destination?.latitude != null &&
                          delivery.destination?.longitude != null
                          ? `${delivery.destination.latitude},${delivery.destination.longitude}`
                          : delivery.deliveryAddress,
                      );
                      const pickupMap = mapsLink(
                        delivery.branch?.latitude != null &&
                          delivery.branch?.longitude != null
                          ? `${delivery.branch.latitude},${delivery.branch.longitude}`
                          : delivery.pickupAddress,
                      );
                      return (
                        <article
                          key={delivery.assignmentId}
                          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wider text-orange-600">
                                Delivery order
                              </p>
                              <h3 className="mt-1 text-lg font-extrabold text-slate-900">
                                {delivery.orderNumber}
                              </h3>
                              <p className="mt-1 text-xs text-slate-500">
                                Assigned {dateTime(delivery.assignedAt)}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${statusStyle(delivery.deliveryStatus)}`}
                            >
                              {statusLabel(delivery.deliveryStatus)}
                            </span>
                          </div>

                          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                            <section className="rounded-xl bg-slate-50 p-4">
                              <div className="flex items-start gap-3">
                                <MapPin
                                  size={18}
                                  className="mt-0.5 shrink-0 text-orange-600"
                                />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Restaurant pickup
                                  </p>
                                  <p className="mt-1 font-bold text-slate-900">
                                    {delivery.branch?.name}
                                  </p>
                                  <p className="mt-1 text-sm leading-5 text-slate-600">
                                    {delivery.pickupAddress ||
                                      "Pickup address unavailable"}
                                  </p>
                                  <a
                                    href={pickupMap}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                                  >
                                    <ExternalLink size={14} />
                                    Navigate to pickup
                                  </a>
                                  {delivery.branch?.phone && (
                                    <a
                                      href={`tel:${delivery.branch.phone}`}
                                      className="ml-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                                    >
                                      <Phone size={14} />
                                      Call restaurant
                                    </a>
                                  )}
                                </div>
                              </div>
                            </section>
                            <section className="rounded-xl bg-slate-50 p-4">
                              <div className="flex items-start gap-3">
                                <MapPin
                                  size={18}
                                  className="mt-0.5 shrink-0 text-emerald-600"
                                />
                                <div className="min-w-0">
                                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Customer destination
                                  </p>
                                  <p className="mt-1 font-bold text-slate-900">
                                    {delivery.customerName}
                                  </p>
                                  <p className="mt-1 whitespace-pre-line text-sm leading-5 text-slate-600">
                                    {delivery.deliveryAddress}
                                  </p>
                                  <a
                                    href={customerMap}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                                  >
                                    <ExternalLink size={14} />
                                    Navigate to customer
                                  </a>
                                  {delivery.customerPhone && (
                                    <a
                                      href={`tel:${delivery.customerPhone}`}
                                      className="ml-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                                    >
                                      <Phone size={14} />
                                      Call customer
                                    </a>
                                  )}
                                </div>
                              </div>
                            </section>
                          </div>

                          {delivery.paymentMethod === "cash_on_delivery" && (
                            <div className="px-4 pb-4 sm:px-5">
                              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                                <div><p className="text-xs font-bold uppercase tracking-wide text-amber-800">Cash on delivery</p><p className="mt-1 text-xl font-extrabold text-slate-900">{money(delivery.codExpectedAmount)}</p><p className="mt-1 text-xs capitalize text-slate-600">{delivery.codCollection?.status ? `Collection status: ${delivery.codCollection.status.replaceAll("_", " ")}` : "Collect the exact amount at handoff."}</p></div>
                                {delivery.deliveryStatus === "at_customer" && !["collected", "reconciled", "disputed"].includes(delivery.codCollection?.status) && <div className="flex flex-wrap gap-2"><button disabled={actingOn === delivery.assignmentId} onClick={() => submitCodCollection(delivery, "collected")} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-50">Confirm cash collected</button><button disabled={actingOn === delivery.assignmentId} onClick={() => submitCodCollection(delivery, "collection_failed")} className="min-h-10 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 disabled:opacity-50">Report collection issue</button></div>}
                              </section>
                            </div>
                          )}
                          <div className="px-4 pb-4 sm:px-5">
                            <section className="rounded-xl border border-slate-100 p-4">
                              <h4 className="font-bold text-slate-900">
                                Items to deliver
                              </h4>
                              {delivery.orderItems?.length ? (
                                <ul className="mt-2 divide-y divide-slate-100">
                                  {delivery.orderItems.map((item) => (
                                    <li key={item.id} className="py-2 text-sm">
                                      <div className="flex justify-between gap-3">
                                        <span className="font-semibold text-slate-800">
                                          {item.quantity} × {item.itemName}
                                          {item.variantName
                                            ? ` · ${item.variantName}`
                                            : ""}
                                        </span>
                                      </div>
                                      {addonNames(item.addonsSnapshot).length >
                                        0 && (
                                        <p className="mt-1 text-xs text-slate-500">
                                          Add-ons:{" "}
                                          {addonNames(item.addonsSnapshot).join(
                                            ", ",
                                          )}
                                        </p>
                                      )}
                                      {item.itemNotes && (
                                        <p className="mt-1 text-xs text-slate-500">
                                          Item note: {item.itemNotes}
                                        </p>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-2 text-sm text-slate-500">
                                  Item details are unavailable.
                                </p>
                              )}
                              {delivery.customerNotes && (
                                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                                  <strong>Customer note:</strong>{" "}
                                  {delivery.customerNotes}
                                </p>
                              )}
                            </section>
                          </div>

                          <div className="px-4 pb-4 sm:px-5">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                              <Clock3 size={15} className="text-orange-600" />
                              Status history
                            </h4>
                            {delivery.history?.length ? (
                              <ol className="mt-3 space-y-0">
                                {delivery.history.map((entry, index) => (
                                  <li
                                    key={entry.id}
                                    className="relative flex gap-3 pb-3 last:pb-0"
                                  >
                                    <span
                                      className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${index === delivery.history.length - 1 ? "bg-orange-100 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}
                                    >
                                      <Check size={13} />
                                    </span>
                                    <div>
                                      <p className="text-sm font-semibold capitalize text-slate-800">
                                        {entry.event.replaceAll("_", " ")}
                                        {entry.toStatus
                                          ? ` · ${statusLabel(entry.toStatus)}`
                                          : ""}
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        {dateTime(entry.createdAt)}
                                      </p>
                                      {entry.notes && (
                                        <p className="mt-1 text-xs text-slate-600">
                                          {entry.notes}
                                        </p>
                                      )}
                                    </div>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="mt-2 text-xs text-slate-500">
                                No status updates recorded yet.
                              </p>
                            )}
                          </div>

                          {!terminal && (
                            <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
                              <div className="flex flex-wrap gap-2">
                                {delivery.deliveryStatus ===
                                  "pending_acceptance" && (
                                  <>
                                    <button
                                      disabled={actingOn === delivery.assignmentId || deliveryOtp.length !== 6}
                                      onClick={() =>
                                        actOnAssignment(
                                          delivery.assignmentId,
                                          "accept",
                                        )
                                      }
                                      className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50"
                                    >
                                      Accept assignment
                                    </button>
                                    <button
                                      disabled={
                                        actingOn === delivery.assignmentId
                                      }
                                      onClick={() =>
                                        actOnAssignment(
                                          delivery.assignmentId,
                                          "reject",
                                        )
                                      }
                                      className="min-h-11 rounded-xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 disabled:opacity-50"
                                    >
                                      Decline
                                    </button>
                                  </>
                                )}
                                {delivery.deliveryStatus === "accepted" && (
                                  <button
                                    disabled={
                                      actingOn === delivery.assignmentId
                                    }
                                    onClick={() =>
                                      actOnAssignment(
                                        delivery.assignmentId,
                                        "arriving_at_restaurant",
                                      )
                                    }
                                    className="min-h-11 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50"
                                  >
                                    I’m arriving at the restaurant
                                  </button>
                                )}
                                {delivery.deliveryStatus === "arriving_at_restaurant" && <button disabled={actingOn === delivery.assignmentId} onClick={() => actOnAssignment(delivery.assignmentId, "at_restaurant")} className="min-h-11 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">I’ve reached the restaurant</button>}
                                {delivery.deliveryStatus === "at_restaurant" && (delivery.kitchenStatus !== "ready" ? <p className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Waiting for restaurant to prepare order. Pickup unlocks after the kitchen marks it ready.</p> : delivery.kitchenStatus !== "handed_over" ? <p className="w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Order is ready. Restaurant staff must confirm packed food handover before pickup.</p> : <button disabled={actingOn === delivery.assignmentId} onClick={() => actOnAssignment(delivery.assignmentId, "picked_up")} className="min-h-11 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">Confirm pickup</button>)}
                                {delivery.deliveryStatus === "picked_up" && (
                                  <button
                                    disabled={
                                      actingOn === delivery.assignmentId
                                    }
                                    onClick={() =>
                                      actOnAssignment(
                                        delivery.assignmentId,
                                        "on_the_way",
                                      )
                                    }
                                    className="min-h-11 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50"
                                  >
                                    Start delivery
                                  </button>
                                )}
                                {delivery.deliveryStatus === "on_the_way" && (
                                  <>
                                    <button
                                      disabled={
                                        actingOn === delivery.assignmentId
                                      }
                                      onClick={() => actOnAssignment(delivery.assignmentId, "at_customer")}
                                      className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50"
                                    >
                                      I’ve reached the customer
                                    </button>
                                    <button
                                      disabled={
                                        actingOn === delivery.assignmentId
                                      }
                                      onClick={() => {
                                        setFailedAssignment(
                                          delivery.assignmentId,
                                        );
                                        setFailureReason("");
                                      }}
                                      className="min-h-11 rounded-xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 disabled:opacity-50"
                                    >
                                      Report failed delivery
                                    </button>
                                  </>
                                )}
                                {delivery.deliveryStatus === "at_customer" && <button disabled={actingOn === delivery.assignmentId} onClick={() => setConfirmAssignment(delivery.assignmentId)} className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">Confirm delivery with OTP</button>}
                              </div>
                              {confirmAssignment === delivery.assignmentId && (
                                <div className="mt-3 rounded-xl border border-emerald-200 bg-white p-4">
                                  <p className="text-sm font-semibold text-slate-800">
                                    Ask the customer for the six-digit delivery OTP after handing over the order.
                                  </p>
                                  <label className="mt-3 block text-xs font-bold text-slate-600">Customer delivery OTP<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={deliveryOtp} onChange={(event) => setDeliveryOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-lg tracking-[.3em]" placeholder="6-digit code"/></label>
                                  <div className="mt-3 flex gap-2">
                                    <button
                                      disabled={
                                        actingOn === delivery.assignmentId
                                      }
                                      onClick={() =>
                                        actOnAssignment(
                                          delivery.assignmentId,
                                          "delivered",
                                          { confirmation: true, otp: deliveryOtp },
                                        )
                                      }
                                      className="min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white"
                                    >
                                      Yes, confirm delivered
                                    </button>
                                    <button
                                      onClick={() => setConfirmAssignment("")}
                                      className="min-h-10 rounded-lg border px-4 text-sm font-semibold text-slate-700"
                                    >
                                      Go back
                                    </button>
                                  </div>
                                </div>
                              )}
                              {failedAssignment === delivery.assignmentId && (
                                <form
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    if (failureReason.trim())
                                      actOnAssignment(
                                        delivery.assignmentId,
                                        "failed",
                                        { reason: failureReason.trim() },
                                      );
                                  }}
                                  className="mt-3 rounded-xl border border-rose-200 bg-white p-4"
                                >
                                  <label className="block text-sm font-semibold text-slate-800">
                                    Why could the order not be delivered?
                                    <textarea
                                      required
                                      minLength={3}
                                      maxLength={1000}
                                      value={failureReason}
                                      onChange={(event) =>
                                        setFailureReason(event.target.value)
                                      }
                                      className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-rose-400"
                                      placeholder="Add a short reason"
                                    />
                                  </label>
                                  <div className="mt-3 flex gap-2">
                                    <button
                                      disabled={
                                        !failureReason.trim() ||
                                        actingOn === delivery.assignmentId
                                      }
                                      className="min-h-10 rounded-lg bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-50"
                                    >
                                      Submit failed delivery
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setFailedAssignment("")}
                                      className="min-h-10 rounded-lg border px-4 text-sm font-semibold text-slate-700"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                      <PackageCheck size={25} />
                    </div>
                    <h3 className="mt-4 font-bold text-slate-900">
                      You’re all caught up
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      New assignments will appear here when they’re sent to you.
                    </p>
                  </div>
                )}
              </section>
              <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <details>
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-extrabold text-slate-900">
                          Assignment history
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Timeouts, declines and reassignments are retained here
                          by order.
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                        {dashboard.assignmentAttempts?.length || 0} orders
                      </span>
                    </div>
                  </summary>
                  {dashboard.assignmentAttempts?.length ? (
                    <div className="mt-5 space-y-3">
                      {dashboard.assignmentAttempts.map((group) => (
                        <article
                          key={group.orderId}
                          className="rounded-xl border border-slate-200 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="font-bold text-slate-900">
                                {group.orderNumber || "Delivery order"}
                              </h3>
                              <p className="mt-1 text-xs text-slate-500">
                                {group.attempts?.length || 0} assignment{" "}
                                {(group.attempts?.length || 0) === 1
                                  ? "attempt"
                                  : "attempts"}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-slate-500">
                              {group.attempts?.filter(
                                (attempt) => attempt.isCurrent,
                              ).length
                                ? "Current assignment shown above"
                                : "No current assignment"}
                            </span>
                          </div>
                          <ol className="mt-3 space-y-2">
                            {group.attempts?.map((attempt) => (
                              <li
                                key={attempt.id}
                                className="flex flex-col justify-between gap-1 border-t border-slate-100 pt-2 text-sm sm:flex-row sm:items-center"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusStyle(attempt.status)}`}
                                  >
                                    {statusLabel(attempt.status)}
                                  </span>
                                  {attempt.isCurrent && (
                                    <span className="text-xs font-bold text-emerald-700">
                                      Current
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 sm:text-right">
                                  <p>Assigned {dateTime(attempt.assignedAt)}</p>
                                  {attempt.acceptedAt && <p>Accepted {dateTime(attempt.acceptedAt)}</p>}
                                  {attempt.completedAt && <p>Closed {dateTime(attempt.completedAt)}</p>}
                                  {attempt.notes && <p className="mt-1 text-amber-800">Reason: {attempt.notes}</p>}
                                  {attempt.history?.map((entry) => <p key={entry.id} className="mt-1">{statusLabel(entry.toStatus || entry.event)} · {dateTime(entry.createdAt)}{entry.performer ? ` · ${[entry.performer.firstName, entry.performer.lastName].filter(Boolean).join(" ")}` : ""}{entry.notes ? ` · ${entry.notes}` : ""}</p>)}
                                </div>
                              </li>
                            ))}
                          </ol>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                      No assignment attempts have been recorded.
                    </p>
                  )}
                </details>
              </section>
              <p className="mt-6 text-center text-xs text-slate-400">
                Only assigned delivery information for your restaurant account
                is shown here.
              </p>
            </>
          )
        )}
      </main>
    </div>
  );
}

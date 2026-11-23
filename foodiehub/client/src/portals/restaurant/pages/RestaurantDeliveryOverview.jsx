import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Package,
  PackageCheck,
  RefreshCw,
  Truck,
} from "lucide-react";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";

const errorText = (error) =>
  error.response?.data?.message || "Could not load the delivery overview.";
const label = (value) =>
  ({
    pending_acceptance: "Awaiting acceptance",
    accepted: "Accepted",
    arriving_at_restaurant: "Arriving at restaurant",
    picked_up: "Picked up",
    on_the_way: "On the way",
    delivered: "Delivered",
    failed: "Failed",
    cancelled: "Cancelled",
    rejected: "Rejected",
  })[value] ||
  value?.replaceAll("_", " ") ||
  "Unassigned";

export default function RestaurantDeliveryOverview() {
  const { user } = useAuth();
  const membership = (user?.restaurantMemberships || []).find(
    (item) =>
      item.status === "active" && item.role?.code === "restaurant_owner",
  );
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!membership?.restaurantId) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/restaurant/delivery/overview", {
        params: { restaurantId: membership.restaurantId },
      });
      setData(response.data);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [membership?.restaurantId]);
  useEffect(() => {
    load();
  }, [load]);
  if (!membership)
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Restaurant owner access is required to view delivery activity.
      </div>
    );
  const counts = data?.counts || {};
  const cards = [
    [
      "Delivery orders",
      counts.totalOrders,
      Package,
      "text-slate-600 bg-slate-100",
    ],
    ["Pending", counts.pendingOrders, Clock3, "text-amber-600 bg-amber-50"],
    ["Preparing", counts.preparingOrders, Activity, "text-blue-600 bg-blue-50"],
    [
      "Ready for pickup",
      counts.readyOrders,
      PackageCheck,
      "text-orange-600 bg-orange-50",
    ],
    [
      "Active assignments",
      counts.activeAssignments,
      Truck,
      "text-violet-600 bg-violet-50",
    ],
    [
      "Completed today",
      counts.completedToday,
      CheckCircle2,
      "text-emerald-600 bg-emerald-50",
    ],
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-orange-600">
            Delivery Management
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">
            Delivery Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Live counts and recent delivery assignments from your restaurant.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700"
        >
          {loading ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([title, value, Icon, style]) => (
          <article
            key={title}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-500">{title}</p>
              <span
                className={`flex size-9 items-center justify-center rounded-xl ${style}`}
              >
                <Icon size={18} />
              </span>
            </div>
            <p className="mt-3 text-2xl font-black text-slate-950">
              {loading && !data
                ? "—"
                : Number(value || 0).toLocaleString("en-IN")}
            </p>
          </article>
        ))}
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h2 className="font-extrabold text-slate-900">
              Recent assignments
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Latest assignment records across your branches.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/restaurant/delivery/orders"
              className="rounded-lg border px-3 py-2 text-xs font-bold text-slate-700"
            >
              Orders
            </Link>
            <Link
              to="/restaurant/delivery/assignments"
              className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white"
            >
              Assignment history
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Order status</th>
                <th className="px-4 py-3">Assignment</th>
                <th className="px-4 py-3">Assigned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.recentAssignments || []).map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-bold text-slate-800">
                    {item.orderNumber}
                    <span className="block text-xs font-normal text-slate-500">
                      {item.customerName}
                    </span>
                  </td>
                  <td className="px-4 py-3">{item.branch}</td>
                  <td className="px-4 py-3">{item.employee || "—"}</td>
                  <td className="px-4 py-3 capitalize">
                    {label(item.orderStatus)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize">
                      {label(item.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(item.assignedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {!loading && !data?.recentAssignments?.length && (
                <tr>
                  <td
                    colSpan="6"
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    No delivery assignments have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

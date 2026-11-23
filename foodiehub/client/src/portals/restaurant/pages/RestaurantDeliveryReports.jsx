import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  PackageCheck,
  XCircle,
} from "lucide-react";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";

const input =
  "min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
const statuses = [
  ["", "All statuses"],
  ["pending_acceptance", "Awaiting acceptance"],
  ["accepted", "Accepted"],
  ["arriving_at_restaurant", "Arriving at restaurant"],
  ["picked_up", "Picked up"],
  ["on_the_way", "On the way"],
  ["delivered", "Delivered"],
  ["failed", "Failed"],
  ["cancelled", "Cancelled"],
  ["rejected", "Rejected"],
  ["reassigned", "Reassigned"],
];
const errorText = (error) =>
  error.response?.data?.message || "Could not load delivery reports.";

export default function RestaurantDeliveryReports() {
  const { user } = useAuth();
  const membership = (user?.restaurantMemberships || []).find(
    (item) =>
      item.status === "active" && item.role?.code === "restaurant_owner",
  );
  const [period, setPeriod] = useState("last7");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [branches, setBranches] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!membership?.restaurantId) return;
    setLoading(true);
    setError("");
    try {
      const params = {
        restaurantId: membership.restaurantId,
        period,
        branchId: branchId || undefined,
        employeeId: employeeId || undefined,
        status: status || undefined,
        ...(period === "custom"
          ? { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }
          : {}),
      };
      const [reportsResponse, branchesResponse] = await Promise.all([
        api.get("/restaurant/delivery/reports", { params }),
        api.get("/restaurant/delivery/orders/branches", {
          params: { restaurantId: membership.restaurantId },
        }),
      ]);
      setReport(reportsResponse.data);
      setBranches(branchesResponse.data.branches || []);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [
    membership?.restaurantId,
    period,
    dateFrom,
    dateTo,
    branchId,
    employeeId,
    status,
  ]);

  useEffect(() => {
    load();
  }, [load]);
  const date = (value) => (value ? new Date(value).toLocaleDateString() : "—");
  const number = (value) =>
    new Intl.NumberFormat("en-IN").format(Number(value || 0));
  const counts = report?.counts || {};
  const cards = [
    ["Total assignments", counts.total, PackageCheck, "orange"],
    ["Awaiting acceptance", counts.pending, Clock3, "amber"],
    ["Completed deliveries", counts.completed, CheckCircle2, "emerald"],
    ["Failed deliveries", counts.failed, AlertCircle, "rose"],
    ["Cancelled deliveries", counts.cancelled, XCircle, "slate"],
    [
      "Avg. assignment to completion",
      counts.averageAssignmentToCompletionMinutes == null
        ? "—"
        : `${number(counts.averageAssignmentToCompletionMinutes)} min`,
      Activity,
      "blue",
    ],
  ];
  const tones = {
    orange: "bg-orange-50 text-orange-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-600",
  };

  if (!membership)
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Restaurant owner access is required to view delivery reports.
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-sm font-semibold text-orange-600">
          Delivery Management
        </p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">
          Delivery Reports
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Performance calculated from recorded delivery assignments. Date ranges
          use UTC.
        </p>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </div>
      )}
      <section
        aria-label="Report filters"
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Date range
            <select
              className={input}
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          {period === "custom" && (
            <>
              <label className="grid gap-1 text-xs font-bold text-slate-600">
                From
                <input
                  className={input}
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-xs font-bold text-slate-600">
                To
                <input
                  className={input}
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </label>
            </>
          )}
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Branch
            <select
              className={input}
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="">All branches</option>
              {branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Employee
            <select
              className={input}
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              <option value="">All employees</option>
              {(report?.filters?.employees || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Status
            <select
              className={input}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {statuses.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {loading ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <CalendarDays size={16} />
            )}
            Apply filters
          </button>
        </div>
        {report?.range && (
          <p className="mt-3 text-xs text-slate-500">
            Showing {date(report.range.from)} to {date(report.range.to)} (UTC)
          </p>
        )}
      </section>
      {loading && !report ? (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <LoaderCircle className="animate-spin" size={18} />
          Loading report…
        </div>
      ) : (
        <>
          <section
            aria-label="Delivery metrics"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {cards.map(([title, value, Icon, tone]) => (
              <article
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-500">
                    {title}
                  </p>
                  <span
                    className={`flex size-9 items-center justify-center rounded-xl ${tones[tone]}`}
                  >
                    <Icon size={18} />
                  </span>
                </div>
                <p className="mt-3 text-2xl font-black text-slate-950">
                  {value == null
                    ? "—"
                    : typeof value === "number"
                      ? number(value)
                      : value}
                </p>
                {title === "Avg. assignment to completion" && (
                  <p className="mt-1 text-xs text-slate-500">
                    For delivered assignments with recorded completion time
                  </p>
                )}
              </article>
            ))}
          </section>
          <div className="grid gap-5 xl:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <h2 className="font-extrabold text-slate-900">
                  Employee performance
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Completed deliveries, active assignments and total assignments
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Completed</th>
                      <th className="px-4 py-3">Active</th>
                      <th className="px-4 py-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(report?.employees || []).map((item) => (
                      <tr key={item.employeeId}>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {item.name}
                        </td>
                        <td className="px-4 py-3">{number(item.completed)}</td>
                        <td className="px-4 py-3">{number(item.active)}</td>
                        <td className="px-4 py-3">{number(item.total)}</td>
                      </tr>
                    ))}
                    {!report?.employees?.length && (
                      <tr>
                        <td
                          colSpan="4"
                          className="px-4 py-10 text-center text-sm text-slate-500"
                        >
                          No assignment records for these filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <h2 className="font-extrabold text-slate-900">
                  Branch performance
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Delivery outcomes recorded at each branch
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Completed</th>
                      <th className="px-4 py-3">Failed</th>
                      <th className="px-4 py-3">Cancelled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(report?.branches || []).map((item) => (
                      <tr key={item.branchId}>
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          {item.name}
                        </td>
                        <td className="px-4 py-3">{number(item.total)}</td>
                        <td className="px-4 py-3">{number(item.completed)}</td>
                        <td className="px-4 py-3">{number(item.failed)}</td>
                        <td className="px-4 py-3">{number(item.cancelled)}</td>
                      </tr>
                    ))}
                    {!report?.branches?.length && (
                      <tr>
                        <td
                          colSpan="5"
                          className="px-4 py-10 text-center text-sm text-slate-500"
                        >
                          No branch records for these filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

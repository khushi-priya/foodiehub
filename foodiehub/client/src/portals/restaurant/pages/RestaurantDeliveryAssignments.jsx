import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";

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
const field =
  "min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
const permissionsFor = (membership) =>
  (membership?.role?.permissions || []).map((entry) =>
    typeof entry === "string" ? entry : entry.code,
  );
const dateValue = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const statusName = (value) =>
  statuses.find(([key]) => key === value)?.[1] ||
  value?.replaceAll("_", " ") ||
  "Unknown";

export default function RestaurantDeliveryAssignments({
  platformMode = false,
}) {
  const { user } = useAuth();
  const memberships = (user?.restaurantMemberships || []).filter(
    (item) => item.status === "active",
  );
  const membership =
    memberships.find(
      (item) =>
        (typeof item.role === "string" ? item.role : item.role?.code) ===
        "restaurant_owner",
    ) ||
    memberships.find((item) =>
      permissionsFor(item).includes("delivery_assignments.view"),
    );
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({
    assignments: [],
    pagination: { page: 1, totalPages: 1, total: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!platformMode && !membership?.restaurantId) return;
    setLoading(true);
    setError("");
    try {
      let rows;
      let branchRows;
      if (platformMode) {
        rows = await api.get("/admin/delivery/assignments", {
          params: {
            branchId: branchId || undefined,
            status: status || undefined,
            search: search || undefined,
            page,
            pageSize: 20,
          },
        });
        branchRows = rows.data?.branches;
      } else {
        const [assignments, branchResponse] = await Promise.all([
          api.get("/restaurant/delivery/assignments", {
            params: {
              restaurantId: membership.restaurantId,
              branchId: branchId || undefined,
              status: status || undefined,
              search: search || undefined,
              page,
              pageSize: 20,
            },
          }),
          api.get("/restaurant/delivery/orders/branches", {
            params: { restaurantId: membership.restaurantId },
          }),
        ]);
        rows = assignments;
        branchRows = branchResponse.data?.branches;
      }
      setResult({
        assignments: Array.isArray(rows.data?.assignments)
          ? rows.data.assignments
          : [],
        pagination: rows.data?.pagination || {
          page: 1,
          totalPages: 1,
          total: 0,
        },
      });
      setBranches(Array.isArray(branchRows) ? branchRows : []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not load delivery assignment history.",
      );
      setResult((current) => ({ ...current, assignments: [] }));
    } finally {
      setLoading(false);
    }
  }, [platformMode, membership?.restaurantId, branchId, status, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Number(result.pagination?.totalPages) || 1);
  const rangeLabel = useMemo(
    () =>
      `${Number(result.pagination?.total || 0).toLocaleString("en-IN")} records`,
    [result.pagination?.total],
  );

  if (!platformMode && !membership)
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Delivery assignment view permission is required.
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-orange-600">
            {platformMode ? "Platform operations" : "Delivery Management"}
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">
            Delivery Assignments
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {platformMode
              ? "View assignments across restaurants and branches."
              : "Review assignments, associate progress, and delivery history for your authorized branches."}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <AlertCircle size={18} className="shrink-0" />
          {error}
        </div>
      )}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-end">
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          Branch
          <select
            className={field}
            value={branchId}
            onChange={(event) => {
              setBranchId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {platformMode
                ? "All restaurants and branches"
                : "All authorized branches"}
            </option>
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {platformMode
                  ? `${item.restaurantName} · ${item.name}`
                  : item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-600">
          Assignment status
          <select
            className={field}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            {statuses.map(([value, title]) => (
              <option key={value} value={value}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchDraft.trim());
          }}
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search assignments</span>
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className={`${field} w-full pl-9`}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search order or employee"
            />
          </label>
          <button className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white">
            Search
          </button>
        </form>
        <span className="whitespace-nowrap text-sm text-slate-500">
          {rangeLabel}
        </span>
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {platformMode && <th className="px-4 py-3">Restaurant</th>}
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Accepted</th>
                <th className="px-4 py-3">Picked up</th>
                <th className="px-4 py-3">Delivered</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Record note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={platformMode ? 11 : 10}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    <LoaderCircle
                      className="mx-auto mb-2 animate-spin"
                      size={20}
                    />
                    Loading assignment records…
                  </td>
                </tr>
              ) : (
                result.assignments.map((item) => (
                  <tr key={item.id}>
                    {platformMode && (
                      <td className="px-4 py-3">{item.restaurant}</td>
                    )}
                    <td className="px-4 py-3 font-bold text-slate-800">
                      {item.orderNumber}
                      <span className="block text-xs font-normal text-slate-500">
                        {item.customerName}
                      </span>
                    </td>
                    <td className="px-4 py-3">{item.branch}</td>
                    <td className="px-4 py-3">{item.employee}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">
                        {statusName(item.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {dateValue(item.assignedAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {dateValue(item.acceptedAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {dateValue(item.pickedUpAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {dateValue(item.deliveredAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {dateValue(item.completedAt)}
                    </td>
                    <td
                      className="max-w-48 truncate px-4 py-3 text-xs text-slate-500"
                      title={item.notes || ""}
                    >
                      {item.notes || "—"}
                    </td>
                  </tr>
                ))
              )}
              {!loading && !result.assignments.length && (
                <tr>
                  <td
                    colSpan={platformMode ? 11 : 10}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    <ClipboardList
                      className="mx-auto mb-2 text-slate-400"
                      size={22}
                    />
                    No assignment records match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 p-4">
          <span className="text-xs text-slate-500">
            Page {result.pagination?.page || page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              aria-label="Previous page"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-lg border p-2 disabled:opacity-40"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              aria-label="Next page"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border p-2 disabled:opacity-40"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

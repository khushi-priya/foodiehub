import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../services/api";
import {
  BadgePercent,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  TicketPercent,
  ToggleLeft,
  ToggleRight,
  Users,
} from "lucide-react";

const blankForm = () => {
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 30 * 86400000);
  const local = (date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  return {
    name: "",
    code: "",
    description: "",
    discountType: "percentage",
    discountValue: "",
    minimumOrderAmount: "0",
    maximumDiscount: "",
    startsAt: local(start),
    expiresAt: local(end),
    usageLimit: "",
    perCustomerLimit: "",
    status: "active",
  };
};
const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const date = (value) => (value ? new Date(value).toLocaleString() : "—");
const field =
  "mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

function Metric({ label, value, icon: Icon, tone = "orange", note }) {
  const tones = {
    orange: "bg-orange-50 text-orange-600",
    green: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <article className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}
      >
        <Icon size={18} />
      </span>
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-extrabold text-slate-900">
          {Number(value || 0).toLocaleString("en-IN")}
        </p>
        {note && <p className="text-[10px] text-slate-400">{note}</p>}
      </div>
    </article>
  );
}

export default function RestaurantCoupons() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({
    totalCoupons: 0,
    activeCoupons: 0,
    expiredCoupons: 0,
    totalUses: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    discountType: "",
    expiry: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [usage, setUsage] = useState(null);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/restaurant/coupons", {
          params: { ...appliedFilters, page, pageSize: 20 },
        });
        setItems(data.data.items);
        setStats(data.data.stats);
        setPagination(data.data.pagination);
      } catch (e) {
        setError(e.response?.data?.message || "Coupons could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [appliedFilters],
  );
  useEffect(() => {
    load(1);
  }, [load]);

  const title = useMemo(
    () => (editor?.id ? "Edit coupon" : "Create restaurant coupon"),
    [editor],
  );
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const values = {
      ...editor,
      startsAt: new Date(editor.startsAt).toISOString(),
      expiresAt: new Date(editor.expiresAt).toISOString(),
      discountValue: Number(editor.discountValue),
      minimumOrderAmount: Number(editor.minimumOrderAmount),
      maximumDiscount:
        editor.maximumDiscount === "" ? null : Number(editor.maximumDiscount),
      usageLimit: editor.usageLimit === "" ? null : Number(editor.usageLimit),
      perCustomerLimit:
        editor.perCustomerLimit === "" ? null : Number(editor.perCustomerLimit),
    };
    delete values.id;
    try {
      if (editor.id) await api.put(`/restaurant/coupons/${editor.id}`, values);
      else await api.post("/restaurant/coupons", values);
      setEditor(null);
      setNotice(editor.id ? "Coupon changes saved." : "Coupon created.");
      await load(pagination.page);
    } catch (e) {
      setError(e.response?.data?.message || "Coupon could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function openEdit(coupon) {
    setError("");
    try {
      const { data } = await api.get(`/restaurant/coupons/${coupon.id}`);
      const row = data.data;
      const local = (value) => {
        const d = new Date(value);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
      };
      setEditor({
        ...row,
        discountValue: String(row.discountValue),
        minimumOrderAmount: String(row.minimumOrderAmount),
        maximumDiscount:
          row.maximumDiscount == null ? "" : String(row.maximumDiscount),
        usageLimit: row.usageLimit == null ? "" : String(row.usageLimit),
        perCustomerLimit:
          row.perCustomerLimit == null ? "" : String(row.perCustomerLimit),
        startsAt: local(row.startsAt),
        expiresAt: local(row.expiresAt),
        description: row.description || "",
      });
    } catch (e) {
      setError(
        e.response?.data?.message || "Coupon details could not be loaded.",
      );
    }
  }

  async function openDetails(coupon) {
    setError("");
    try {
      const [couponResponse, usageResponse] = await Promise.all([
        api.get(`/restaurant/coupons/${coupon.id}`),
        api.get(`/restaurant/coupons/${coupon.id}/usage`, {
          params: { page: 1, pageSize: 20 },
        }),
      ]);
      setDetail(couponResponse.data.data);
      setUsage(usageResponse.data.data);
    } catch (e) {
      setError(
        e.response?.data?.message || "Coupon usage could not be loaded.",
      );
    }
  }

  async function loadUsagePage(page) {
    if (!detail?.id) return;
    try {
      const { data } = await api.get(`/restaurant/coupons/${detail.id}/usage`, {
        params: { page, pageSize: 20 },
      });
      setUsage(data.data);
    } catch (e) {
      setError(
        e.response?.data?.message || "Coupon usage could not be loaded.",
      );
    }
  }

  async function toggle(coupon) {
    const next = coupon.status === "active" ? "inactive" : "active";
    if (
      !window.confirm(
        `${next === "inactive" ? "Deactivate" : "Activate"} coupon ${coupon.code}?`,
      )
    )
      return;
    setError("");
    setNotice("");
    try {
      await api.patch(`/restaurant/coupons/${coupon.id}/status`, {
        status: next,
      });
      setNotice(`Coupon ${next === "active" ? "activated" : "deactivated"}.`);
      await load(pagination.page);
    } catch (e) {
      setError(
        e.response?.data?.message || "Coupon status could not be changed.",
      );
    }
  }

  function applyFilters() {
    setAppliedFilters({ ...filters });
  }
  const statusLabel = (coupon) =>
    coupon.expiresAt && new Date(coupon.expiresAt) <= new Date()
      ? "Expired"
      : coupon.status === "active"
        ? new Date(coupon.startsAt) > new Date()
          ? "Scheduled"
          : "Active"
        : "Inactive";

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-orange-600">
            Restaurant management
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-900">
            Food coupons
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Create offers for customers ordering from your restaurant. Usage is
            checked and calculated securely at checkout.
          </p>
        </div>
        <button
          onClick={() => setEditor(blankForm())}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-orange-600"
        >
          <Plus size={17} />
          Create coupon
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Total coupons"
          value={stats.totalCoupons}
          icon={TicketPercent}
        />
        <Metric
          label="Active now"
          value={stats.activeCoupons}
          icon={Check}
          tone="green"
        />
        <Metric
          label="Expired"
          value={stats.expiredCoupons}
          icon={CalendarClock}
          tone="blue"
        />
        <Metric
          label="Successful uses"
          value={stats.totalUses}
          icon={Users}
          tone="violet"
        />
      </section>
      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
        <label className="text-xs font-semibold text-slate-500">
          Search code or name
          <div className="relative mt-1">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={15}
            />
            <input
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              className={`${field} pl-9`}
              placeholder="Search coupons"
            />
          </div>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Status
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className={field}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Discount type
          <select
            value={filters.discountType}
            onChange={(e) =>
              setFilters({ ...filters, discountType: e.target.value })
            }
            className={field}
          >
            <option value="">All types</option>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Expiry
          <select
            value={filters.expiry}
            onChange={(e) => setFilters({ ...filters, expiry: e.target.value })}
            className={field}
          >
            <option value="">Any expiry</option>
            <option value="current">Currently valid</option>
            <option value="upcoming">Scheduled</option>
            <option value="expired">Expired</option>
          </select>
        </label>
        <button
          onClick={applyFilters}
          className="h-10 self-end rounded-lg bg-slate-900 px-4 text-sm font-bold text-white"
        >
          Filter
        </button>
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-600">
            {pagination.total.toLocaleString("en-IN")} coupons
          </p>
          <button
            onClick={() => load(pagination.page)}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
          >
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-3">Coupon</th>
                <th className="p-3">Discount</th>
                <th className="p-3">Minimum</th>
                <th className="p-3">Maximum</th>
                <th className="p-3">Schedule</th>
                <th className="p-3">Usage</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((coupon) => (
                <tr key={coupon.id} className="text-slate-700">
                  <td className="p-3">
                    <p className="font-bold text-slate-900">{coupon.code}</p>
                    <p className="max-w-48 truncate text-xs text-slate-500">
                      {coupon.name}
                    </p>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <BadgePercent size={14} className="text-orange-500" />
                      {coupon.discountType === "percentage"
                        ? `${Number(coupon.discountValue)}%`
                        : money(coupon.discountValue)}
                    </span>
                  </td>
                  <td className="p-3">{money(coupon.minimumOrderAmount)}</td>
                  <td className="p-3">
                    {coupon.maximumDiscount == null
                      ? "—"
                      : money(coupon.maximumDiscount)}
                  </td>
                  <td className="p-3 text-xs">
                    <p>Starts {date(coupon.startsAt)}</p>
                    <p className="mt-1 text-slate-500">
                      Ends {date(coupon.expiresAt)}
                    </p>
                  </td>
                  <td className="p-3">
                    {coupon.usageCount} / {coupon.usageLimit ?? "∞"}
                    <p className="text-[10px] text-slate-400">
                      per customer {coupon.perCustomerLimit ?? "∞"}
                    </p>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusLabel(coupon) === "Active" ? "bg-emerald-50 text-emerald-700" : statusLabel(coupon) === "Expired" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}
                    >
                      {statusLabel(coupon)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <button
                        title="View usage"
                        onClick={() => openDetails(coupon)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        title="Edit coupon"
                        onClick={() => openEdit(coupon)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-orange-50 hover:text-orange-600"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        title={
                          coupon.status === "active" ? "Deactivate" : "Activate"
                        }
                        onClick={() => toggle(coupon)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-orange-600"
                      >
                        {coupon.status === "active" ? (
                          <ToggleRight size={17} />
                        ) : (
                          <ToggleLeft size={17} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div className="flex justify-center p-10">
              <LoaderCircle className="animate-spin text-orange-500" />
            </div>
          )}
          {!loading && !items.length && (
            <div className="p-12 text-center">
              <TicketPercent className="mx-auto text-slate-300" size={30} />
              <p className="mt-3 font-bold text-slate-800">No coupons found</p>
              <p className="mt-1 text-sm text-slate-500">
                Create your first restaurant food coupon or adjust the filters.
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 p-4 text-xs text-slate-500">
          <span>
            Page {pagination.page} of {pagination.totalPages || 1}
          </span>
          <div className="flex gap-2">
            <button
              disabled={pagination.page <= 1 || loading}
              onClick={() => load(pagination.page - 1)}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Previous
            </button>
            <button
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => load(pagination.page + 1)}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 disabled:opacity-40"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {editor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => !saving && setEditor(null)}
        >
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
                  Restaurant food coupon
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                  {title}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Applies to eligible orders at this restaurant only.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditor(null)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                Coupon name
                <input
                  required
                  maxLength={120}
                  value={editor.name}
                  onChange={(e) =>
                    setEditor({ ...editor, name: e.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Coupon code
                <input
                  required
                  minLength={3}
                  maxLength={40}
                  pattern="[A-Za-z0-9_-]{3,40}"
                  value={editor.code}
                  onChange={(e) =>
                    setEditor({ ...editor, code: e.target.value.toUpperCase() })
                  }
                  className={`${field} uppercase`}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Discount type
                <select
                  value={editor.discountType}
                  onChange={(e) =>
                    setEditor({ ...editor, discountType: e.target.value })
                  }
                  className={field}
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Discount value
                <input
                  required
                  type="number"
                  min="0.01"
                  max={editor.discountType === "percentage" ? 100 : undefined}
                  step="0.01"
                  value={editor.discountValue}
                  onChange={(e) =>
                    setEditor({ ...editor, discountValue: e.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Minimum order amount
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={editor.minimumOrderAmount}
                  onChange={(e) =>
                    setEditor({ ...editor, minimumOrderAmount: e.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Maximum discount (optional)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editor.maximumDiscount}
                  onChange={(e) =>
                    setEditor({ ...editor, maximumDiscount: e.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Starts at
                <input
                  required
                  type="datetime-local"
                  value={editor.startsAt}
                  onChange={(e) =>
                    setEditor({ ...editor, startsAt: e.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Expires at
                <input
                  required
                  type="datetime-local"
                  value={editor.expiresAt}
                  onChange={(e) =>
                    setEditor({ ...editor, expiresAt: e.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Total usage limit (optional)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={editor.usageLimit}
                  onChange={(e) =>
                    setEditor({ ...editor, usageLimit: e.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Per-customer usage limit (optional)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={editor.perCustomerLimit}
                  onChange={(e) =>
                    setEditor({ ...editor, perCustomerLimit: e.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Description
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={editor.description}
                  onChange={(e) =>
                    setEditor({ ...editor, description: e.target.value })
                  }
                  className={field}
                />
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={editor.status === "active"}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      status: e.target.checked ? "active" : "inactive",
                    })
                  }
                />
                Coupon is active
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-xl border px-4 py-2.5 text-sm font-bold"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving && <LoaderCircle size={15} className="animate-spin" />}
                {saving
                  ? "Saving…"
                  : editor.id
                    ? "Save changes"
                    : "Create coupon"}
              </button>
            </div>
          </form>
        </div>
      )}

      {detail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Coupon usage details"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => {
            setDetail(null);
            setUsage(null);
          }}
        >
          <section
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
                  Coupon details & usage
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                  {detail.code} · {detail.name}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {detail.description || "No description provided."} ·{" "}
                  {detail.discountType === "percentage"
                    ? `${Number(detail.discountValue)}%`
                    : money(detail.discountValue)}{" "}
                  off · minimum {money(detail.minimumOrderAmount)}
                </p>
              </div>
              <button
                onClick={() => {
                  setDetail(null);
                  setUsage(null);
                }}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                Close
              </button>
            </div>
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Order ID</th>
                    <th className="p-3">Order amount</th>
                    <th className="p-3">Discount</th>
                    <th className="p-3">Usage date</th>
                    <th className="p-3">Usage status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usage?.items.map((row) => (
                    <tr key={row.id}>
                      <td className="p-3">
                        {[row.customer?.firstName, row.customer?.lastName]
                          .filter(Boolean)
                          .join(" ") || "Customer"}
                      </td>
                      <td className="p-3">
                        {row.order?.orderNumber || row.orderId}
                      </td>
                      <td className="p-3">{money(row.order?.subtotal)}</td>
                      <td className="p-3">{money(row.discountAmount)}</td>
                      <td className="p-3">{date(row.createdAt)}</td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.status === "redeemed" ? "bg-emerald-50 text-emerald-700" : row.status === "reserved" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {usage?.items.length === 0 && (
                <p className="p-8 text-center text-sm text-slate-500">
                  This coupon has not been used.
                </p>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>
                {usage?.pagination.total.toLocaleString("en-IN") || 0} records ·
                page {usage?.pagination.page || 1} of{" "}
                {usage?.pagination.totalPages || 1}
              </span>
              {usage?.pagination.totalPages > 1 && (
                <div className="flex gap-2">
                  <button
                    disabled={usage.pagination.page <= 1}
                    onClick={() => loadUsagePage(usage.pagination.page - 1)}
                    className="rounded-lg border px-3 py-2 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={
                      usage.pagination.page >= usage.pagination.totalPages
                    }
                    onClick={() => loadUsagePage(usage.pagination.page + 1)}
                    className="rounded-lg border px-3 py-2 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Customer names and order references only; contact details are not
              shown.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

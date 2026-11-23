
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Tags,
  Plus,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock3,
  XCircle,
  X,
  Utensils,
  LoaderCircle,
  Edit3,
} from "lucide-react";
import { api } from "../../../services/api";

const emptyForm = {
  name: "",
  description: "",
  imageUrl: "",
  displayOrder: 0,
};

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

const getError = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Something went wrong.";

const getList = (response) => {
  const data = response?.data?.data ?? response?.data;
  if (Array.isArray(data)) return data;
  return data?.rows || data?.categories || data?.requests || [];
};

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CategoryForm({ initial, onSave, onCancel, busy }) {
  const [form, setForm] = useState({
    ...emptyForm,
    ...(initial || {}),
  });
  const [error, setError] = useState("");

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) {
      setError("Please enter a category name.");
      return;
    }

    try {
      await onSave({
        name: form.name.trim(),
        description: form.description?.trim() || "",
        imageUrl: form.imageUrl?.trim() || "",
        displayOrder: Number(form.displayOrder || 0),
      });
    } catch (err) {
      setError(getError(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-slate-600">
          Category name *
        </label>
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="e.g. South Indian"
          maxLength={100}
          required
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-600">
          Description
        </label>
        <textarea
          className={inputClass}
          rows={3}
          value={form.description || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Describe this category..."
          maxLength={500}
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-600">
          Image URL
        </label>
        <input
          className={inputClass}
          type="url"
          value={form.imageUrl || ""}
          onChange={(e) => update("imageUrl", e.target.value)}
          placeholder="https://example.com/category.jpg"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-600">
          Display order
        </label>
        <input
          className={inputClass}
          type="number"
          min="0"
          step="1"
          value={form.displayOrder ?? 0}
          onChange={(e) => update("displayOrder", e.target.value)}
        />
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {busy
            ? "Submitting..."
            : initial?.requestId
              ? "Resubmit Request"
              : "Submit Request"}
        </button>
      </div>
    </form>
  );
}

function StatusBadge({ status }) {
  const styles = {
    approved: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    rejected: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold capitalize ${
        styles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status || "Unknown"}
    </span>
  );
}

function CategoryCard({ category }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md">
      <div className="h-40 overflow-hidden bg-slate-100">
        {category.imageUrl ? (
          <img
            src={category.imageUrl}
            alt={category.name}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300">
            <Utensils size={36} />
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold capitalize text-slate-800">
            {category.name}
          </h3>
          <StatusBadge status="approved" />
        </div>

        <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">
          {category.description || "No description available."}
        </p>

        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">
            {category.scope === "global"
              ? "Global category"
              : "Restaurant-specific"}
          </span>

          <span className="text-xs font-semibold text-slate-700">
            {category.itemCount ?? 0} food items
          </span>
        </div>
      </div>
    </article>
  );
}

function RequestCard({ request, onResubmit }) {
  const status = String(request.status || "pending").toLowerCase();

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-orange-200 hover:shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-300">
          {request.imageUrl ? (
            <img
              src={request.imageUrl}
              alt={request.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Tags size={25} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold capitalize text-slate-800">
              {request.name}
            </h3>
            <StatusBadge status={status} />
          </div>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            {request.description || "No description provided."}
          </p>

          <p className="mt-2 text-[11px] text-slate-400">
            Submitted:{" "}
            {request.createdAt
              ? new Date(request.createdAt).toLocaleDateString()
              : "Date unavailable"}
          </p>
        </div>

        {status === "rejected" && (
          <div className="sm:self-start">
            <button
              type="button"
              onClick={() => onResubmit(request)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100"
            >
              <Edit3 size={14} />
              Edit & Resubmit
            </button>
          </div>
        )}
      </div>

      {status === "rejected" && request.rejectionReason && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3">
          <p className="text-xs font-bold text-red-700">
            Rejection reason
          </p>
          <p className="mt-1 text-xs leading-5 text-red-600">
            {request.rejectionReason}
          </p>
        </div>
      )}

      {status === "approved" && (
        <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          This category has been approved and is available in your Categories list.
        </div>
      )}
    </article>
  );
}

function SummaryCard({ label, count, icon: Icon, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-800">
            {count}
          </p>
        </div>
        <div className={`rounded-xl p-3 ${tone}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

export default function RestaurantCategories() {
  const [categories, setCategories] = useState([]);
  const [requests, setRequests] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [activeTab, setActiveTab] = useState("categories");
  const [requestFilter, setRequestFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [categoryResponse, requestResponse] = await Promise.all([
        api.get("/restaurant/menu/categories"),
        api.get("/restaurant/menu/category-requests"),
      ]);

      setCategories(getList(categoryResponse));
      setRequests(getList(requestResponse));
    } catch (err) {
      setError(getError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      approved: requests.filter(
        (request) => request.status === "approved",
      ).length,
      pending: requests.filter(
        (request) => request.status === "pending",
      ).length,
      rejected: requests.filter(
        (request) => request.status === "rejected",
      ).length,
    }),
    [requests],
  );

  const visibleCategories = useMemo(() => {
    const term = search.trim().toLowerCase();

    return categories.filter((category) => {
      return (
        !term ||
        category.name?.toLowerCase().includes(term) ||
        category.description?.toLowerCase().includes(term)
      );
    });
  }, [categories, search]);

  const visibleRequests = useMemo(() => {
    const term = search.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesStatus =
        requestFilter === "all" ||
        request.status === requestFilter;

      const matchesSearch =
        !term ||
        request.name?.toLowerCase().includes(term) ||
        request.description?.toLowerCase().includes(term);

      return matchesStatus && matchesSearch;
    });
  }, [requests, requestFilter, search]);

  async function saveCategory(data) {
    setBusy(true);

    try {
      if (modal?.requestId) {
        await api.put(
          `/restaurant/menu/category-requests/${modal.requestId}`,
          data,
        );

        setNotice("Category request resubmitted successfully.");
      } else {
        await api.post("/restaurant/menu/categories", data);

        setNotice(
          "Category request submitted successfully. It is awaiting Super Admin review.",
        );
      }

      setModal(null);
      setActiveTab("requests");
      setRequestFilter("pending");

      await load();
    } finally {
      setBusy(false);
    }
  }

  function editRejectedRequest(request) {
    setModal({
      requestId: request.id,
      name: request.name || "",
      description: request.description || "",
      imageUrl: request.imageUrl || "",
      displayOrder: request.displayOrder ?? 0,
    });
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-400">
            Workspace / Restaurant Management
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            Categories
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Manage your approved food categories and category approval requests.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModal({})}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
        >
          <Plus size={17} />
          Request Category
        </button>
      </div>

      {/* Feedback */}
      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={17} />
            {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Approved Categories"
          count={categories.length}
          icon={Tags}
          tone="bg-emerald-50 text-emerald-600"
        />

        <SummaryCard
          label="Pending Requests"
          count={counts.pending}
          icon={Clock3}
          tone="bg-amber-50 text-amber-600"
        />

        <SummaryCard
          label="Approved Requests"
          count={counts.approved}
          icon={CheckCircle2}
          tone="bg-blue-50 text-blue-600"
        />

        <SummaryCard
          label="Rejected Requests"
          count={counts.rejected}
          icon={XCircle}
          tone="bg-red-50 text-red-600"
        />
      </div>

      {/* Main tabs */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("categories")}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                activeTab === "categories"
                  ? "bg-orange-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Categories ({categories.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("requests")}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                activeTab === "requests"
                  ? "bg-orange-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Category Requests ({counts.pending})
            </button>
          </div>

          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1 sm:w-64">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-orange-400"
              />
            </label>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                size={17}
                className={loading ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>

        {/* Approved categories */}
        {activeTab === "categories" && (
          <>
            {loading && !categories.length ? (
              <div className="flex justify-center py-14">
                <LoaderCircle className="animate-spin text-orange-500" />
              </div>
            ) : visibleCategories.length ? (
              <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                {visibleCategories.map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                  />
                ))}
              </div>
            ) : (
              <div className="px-5 py-14 text-center">
                <Tags
                  size={34}
                  className="mx-auto text-slate-300"
                />
                <h3 className="mt-3 font-semibold text-slate-700">
                  No approved categories found
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Request a new category to add it to your restaurant menu.
                </p>
                <button
                  type="button"
                  onClick={() => setModal({})}
                  className="mt-4 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
                >
                  Request Category
                </button>
              </div>
            )}
          </>
        )}

        {/* Category requests */}
        {activeTab === "requests" && (
          <>
            <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-4">
              {[
                { key: "all", label: "All", count: requests.length },
                {
                  key: "pending",
                  label: "Pending",
                  count: counts.pending,
                },
                {
                  key: "approved",
                  label: "Approved",
                  count: counts.approved,
                },
                {
                  key: "rejected",
                  label: "Rejected",
                  count: counts.rejected,
                },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRequestFilter(tab.key)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    requestFilter === tab.key
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            {loading && !requests.length ? (
              <div className="flex justify-center py-14">
                <LoaderCircle className="animate-spin text-orange-500" />
              </div>
            ) : visibleRequests.length ? (
              <div className="space-y-3 p-5">
                {visibleRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    onResubmit={editRejectedRequest}
                  />
                ))}
              </div>
            ) : (
              <div className="px-5 py-14 text-center">
                <CheckCircle2
                  size={34}
                  className="mx-auto text-slate-300"
                />
                <h3 className="mt-3 font-semibold text-slate-700">
                  No category requests found
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Your category requests will appear here.
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* Request category modal */}
      {modal && (
        <Modal
          title={
            modal.requestId
              ? "Edit and Resubmit Category"
              : "Request New Category"
          }
          onClose={() => setModal(null)}
        >
          <CategoryForm
            initial={modal.requestId ? modal : null}
            onSave={saveCategory}
            onCancel={() => setModal(null)}
            busy={busy}
          />
        </Modal>
      )}
    </div>
  );
}

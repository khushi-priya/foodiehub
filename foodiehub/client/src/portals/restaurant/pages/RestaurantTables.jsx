import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Armchair,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  LoaderCircle,
  MapPin,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { api } from "../../../services/api";
import { connectFloorSocket } from "../../../services/socket";
import { useAuth } from "../../../context/AuthContext";

const message = (error) =>
  error.response?.data?.message || error.message || "Unable to load tables.";
const blank = { tableNumber: "", branchId: "", seatingCapacity: "2" };
const inputClass =
  "mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50";

async function copyText(value) {
  if (navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(value);
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Copy is unavailable in this browser.");
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function reservationTime(value, timeZone, options) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: timeZone || "Asia/Kolkata",
      ...options,
    }).format(new Date(value));
  } catch {
    return "Time unavailable";
  }
}

function printQrSheet(title, rows) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.opener = null;
  const cards = rows
    .map(
      (row) =>
        `<article><img src="${escapeHtml(row.imageDataUrl)}" alt="QR code"><h2>${escapeHtml(row.title)}</h2><p>${escapeHtml(row.subtitle || "Scan to Order")}</p><small>Scan to Order</small></article>`,
    )
    .join("");
  printWindow.document.open();
  printWindow.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{margin:12mm}*{box-sizing:border-box}body{font:16px Arial,sans-serif;color:#172033;margin:0}header{text-align:center;margin:0 0 20px}h1{font-size:22px;margin:0 0 5px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12mm 8mm}article{break-inside:avoid;text-align:center;border:1px solid #d7dce4;border-radius:10px;padding:12px}img{width:60mm;height:60mm;object-fit:contain}h2{font-size:18px;margin:7px 0 3px}p{margin:0 0 6px;color:#4b5563}small{font-weight:bold;color:#c2410c}@media print{article{border-color:#9ca3af}}</style></head><body><header><h1>${escapeHtml(title)}</h1><p>Scan to open the FoodieHub menu</p></header><main class="grid">${cards}</main></body></html>`,
  );
  printWindow.document.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 500);
  return true;
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-modal-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2
            id="table-modal-title"
            className="text-lg font-bold text-slate-900"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function RestaurantTables() {
  const { user } = useAuth();
  const ownerMembership =
    user?.restaurantMemberships?.find(
      (membership) =>
        membership.status === "active" &&
        (membership.role === "restaurant_owner" ||
          membership.role?.code === "restaurant_owner"),
    ) ||
    user?.restaurantMemberships?.find(
      (membership) => membership.status === "active",
    );
  const restaurantSlug = ownerMembership?.restaurant?.slug;
  const restaurantName = ownerMembership?.restaurant?.name || "Restaurant";
  const [tables, setTables] = useState([]);
  const [branches, setBranches] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    totalPages: 1,
  });
  const [waitersByBranch, setWaitersByBranch] = useState({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || "");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [qrDialog, setQrDialog] = useState(null);
  const [restaurantQr, setRestaurantQr] = useState(null);
  const [restaurantQrLoading, setRestaurantQrLoading] = useState(false);
  const [restaurantQrError, setRestaurantQrError] = useState("");
  const [sheetLoading, setSheetLoading] = useState(false);

  const loadRestaurantQr = useCallback(async () => {
    if (!restaurantSlug) return;
    setRestaurantQrLoading(true);
    setRestaurantQrError("");
    try {
      const result = await api.get(
        `/public/restaurants/${encodeURIComponent(restaurantSlug)}/qr`,
      );
      setRestaurantQr(result.data.data);
    } catch (err) {
      setRestaurantQrError(message(err));
    } finally {
      setRestaurantQrLoading(false);
    }
  }, [restaurantSlug]);

  useEffect(() => {
    loadRestaurantQr();
  }, [loadRestaurantQr]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: 20, status };
      if (search.trim()) params.search = search.trim();
      if (branchId) params.branchId = branchId;
      const [tableResult, branchResult] = await Promise.all([
        api.get("/restaurant/tables", { params }),
        api.get("/restaurant/floor/branches"),
      ]);
      const branchRows = branchResult.data.data || [];
      const waiterRows = await Promise.all(
        branchRows.map(async (branch) => {
          try {
            const result = await api.get("/restaurant/floor/waiters", {
              params: { branchId: branch.id },
            });
            return [branch.id, result.data.data || []];
          } catch {
            return [branch.id, []];
          }
        }),
      );
      setTables(tableResult.data.data.tables || []);
      setPagination(
        tableResult.data.data.pagination || {
          total: 0,
          page: 1,
          totalPages: 1,
        },
      );
      setBranches(branchRows);
      setWaitersByBranch(Object.fromEntries(waiterRows));
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, [page, status, search, branchId]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => connectFloorSocket(() => load()), [load]);

  function announce(text) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 3500);
  }
  async function saveTable(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setFormError("");
    const payload = { ...form, seatingCapacity: Number(form.seatingCapacity) };
    try {
      if (form.id) await api.put(`/restaurant/tables/${form.id}`, payload);
      else await api.post("/restaurant/tables", payload);
      announce(form.id ? "Table updated." : "Table added.");
      setForm(null);
      await load();
    } catch (err) {
      setFormError(message(err));
    } finally {
      setSaving(false);
    }
  }
  async function toggleActive(table) {
    const next = !table.isActive;
    if (
      !next &&
      !window.confirm(
        `Deactivate table ${table.tableNumber}? It will no longer be available for future QR dining setup.`,
      )
    )
      return;
    setBusyId(table.id);
    setError("");
    try {
      await api.patch(`/restaurant/tables/${table.id}/status`, {
        isActive: next,
      });
      announce(
        `Table ${table.tableNumber} ${next ? "activated" : "deactivated"}.`,
      );
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusyId("");
    }
  }
  async function openDetails(table) {
    setDetailsLoading(true);
    setDetails(table);
    try {
      const result = await api.get(`/restaurant/tables/${table.id}`);
      setDetails(result.data.data);
    } catch (err) {
      setError(message(err));
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }
  async function assignWaiter(table, waiterMemberId) {
    setBusyId(table.id);
    setError("");
    try {
      await api.patch(`/restaurant/floor/tables/${table.id}/waiter`, {
        waiterMemberId: waiterMemberId || null,
      });
      announce("Table waiter assignment updated.");
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusyId("");
    }
  }
  async function setOccupancy(table, occupancyStatus) {
    setBusyId(table.id);
    setError("");
    try {
      await api.patch(`/restaurant/floor/tables/${table.id}/occupancy`, {
        status: occupancyStatus,
      });
      announce(`Table marked ${occupancyStatus}.`);
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusyId("");
    }
  }
  async function operateTable(table, operation, targetTableId, orderId) {
    setBusyId(table.id);
    setError("");
    try {
      if (operation === "transfer")
        await api.post(`/restaurant/floor/orders/${orderId}/transfer`, {
          targetTableId,
        });
      else if (operation === "merge")
        await api.post(`/restaurant/floor/tables/${table.id}/merge`, {
          targetTableId,
        });
      else
        await api.post(`/restaurant/floor/tables/${table.id}/split`, {
          targetTableId,
          orderIds: [orderId],
        });
      announce(
        operation === "merge"
          ? "Active orders merged onto the destination table."
          : operation === "split"
            ? "Selected order moved to the destination table."
            : "Order transferred to the destination table.",
      );
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusyId("");
    }
  }
  async function openQr(table) {
    setQrDialog({
      table,
      loading: true,
      imageDataUrl: "",
      qrUrl: "",
      error: "",
    });
    try {
      const result = await api.get(`/public/restaurants/${encodeURIComponent(restaurantSlug)}/qr`);
      setQrDialog({ table, ...result.data.data, loading: false, error: "" });
    } catch (err) {
      setQrDialog({
        table,
        loading: false,
        imageDataUrl: "",
        qrUrl: "",
        error: message(err),
      });
    }
  }
  async function copyQr(url) {
    try {
      await copyText(url);
      announce("QR link copied.");
    } catch (err) {
      setError(message(err));
    }
  }
  function printRestaurantQr() {
    if (!restaurantQr?.imageDataUrl) return;
    if (
      !printQrSheet(`${restaurantName} · Restaurant Menu`, [
        {
          title: restaurantName,
          subtitle: "Restaurant menu · No table assigned",
          imageDataUrl: restaurantQr.imageDataUrl,
        },
      ])
    )
      setError("Allow pop-ups to print this QR code.");
  }
  function printTableQr() {
    if (!qrDialog?.imageDataUrl) return;
    const table = qrDialog.table;
    if (
      !printQrSheet(`${restaurantName} · Table QR`, [
        {
          title: `Table ${table.tableNumber}`,
          subtitle: table.branch?.name || "Dine-in",
          imageDataUrl: qrDialog.imageDataUrl,
        },
      ])
    )
      setError("Allow pop-ups to print this QR code.");
  }
  async function printAllTableQrs() {
    setSheetLoading(true);
    setError("");
    try {
      const params = branchId ? { branchId } : {};
      const result = await api.post(
        "/restaurant/tables/qr-sheet",
        {},
        { params },
      );
      const { tables: codes = [], newlyGeneratedCount = 0 } =
        result.data.data || {};
      if (!codes.length) {
        announce(
          "There are no active tables in this filter to include on the print sheet.",
        );
        return;
      }
      const printed = printQrSheet(
        `${restaurantName} · Table QR Codes`,
        codes.map((code) => ({
          title: `Table ${code.tableNumber}`,
          subtitle: code.branchName,
          imageDataUrl: code.imageDataUrl,
        })),
      );
      if (!printed) {
        setError("Allow pop-ups to print the table QR sheet.");
        return;
      }
      announce(
        `Print sheet opened for ${codes.length} table${codes.length === 1 ? "" : "s"}.${newlyGeneratedCount ? ` Generated ${newlyGeneratedCount} missing QR code${newlyGeneratedCount === 1 ? "" : "s"}.` : ""}`,
      );
    } catch (err) {
      setError(message(err));
    } finally {
      setSheetLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1440px] space-y-6 pb-8">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-orange-600">
            Restaurant workspace / Floor
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Table management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Organize seating by branch and manage table availability.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setForm({ ...blank, branchId: branchId || branches[0]?.id || "" })
          }
          disabled={!branches.length}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={17} />
          Add table
        </button>
      </header>
      <div className="flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <QrCode size={20} className="mt-0.5 shrink-0 text-sky-700" />
        <p>
          <b>One restaurant QR is shared by every table.</b> Customers scan it,
          browse the menu, then choose their branch and an available table.
          Display this same QR code on all restaurant tables.
        </p>
      </div>
      <section
        aria-labelledby="restaurant-qr-title"
        className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-6"
      >
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <QrCode size={21} />
          </div>
          <div className="min-w-0">
            <h2 id="restaurant-qr-title" className="font-bold text-slate-900">
              Restaurant menu QR
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              One QR for {restaurantName}. It opens the public restaurant page
              so customers can choose a branch and table. Display this same QR
              code on all restaurant tables.
            </p>
            {restaurantQrError && (
              <p role="alert" className="mt-2 text-xs text-rose-700">
                {restaurantQrError}{" "}
                <button
                  type="button"
                  onClick={loadRestaurantQr}
                  className="font-semibold underline"
                >
                  Retry
                </button>
              </p>
            )}
            {restaurantQr?.qrUrl && (
              <p className="mt-2 break-all text-xs text-slate-400">
                {restaurantQr.qrUrl}
              </p>
            )}
          </div>
        </div>
        {restaurantQrLoading ? (
          <div
            className="h-32 w-32 shrink-0 animate-pulse rounded-xl bg-slate-100"
            aria-label="Loading restaurant QR"
          />
        ) : restaurantQr?.imageDataUrl ? (
          <div className="flex shrink-0 flex-col items-center gap-3 sm:items-end">
            <img
              src={restaurantQr.imageDataUrl}
              alt={`${restaurantName} restaurant menu QR code`}
              className="h-32 w-32 rounded-xl border border-slate-100 bg-white p-1"
            />
            <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
              <a
                href={restaurantQr.imageDataUrl}
                download={restaurantQr.downloadName}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-orange-500 px-3 text-xs font-bold text-white hover:bg-orange-600"
              >
                Download QR
              </a>
              <button
                type="button"
                onClick={printRestaurantQr}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Printer size={14} />
                Print
              </button>
              <button
                type="button"
                onClick={() => copyQr(restaurantQr.qrUrl)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Copy size={14} />
                Copy link
              </button>
              <a
                href={restaurantQr.qrUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open restaurant menu"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink size={14} />
                Open
              </a>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={loadRestaurantQr}
            className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"
          >
            Load restaurant QR
          </button>
        )}
      </section>
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          {notice}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={load}
            className="shrink-0 font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">Table QR management</h2>
              <p className="mt-1 text-xs text-slate-500">
                {pagination.total} tables in the current filter · all use the same restaurant QR
              </p>
            </div>
            <button
              type="button"
              onClick={printAllTableQrs}
              disabled={sheetLoading || loading}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-50"
            >
              <Printer size={14} />
              {sheetLoading ? "Preparing…" : "Print QR sheet"}
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,240px)_minmax(150px,190px)]">
            <label className="relative min-w-0">
              <span className="sr-only">Search tables</span>
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => {
                  setPage(1);
                  setSearch(event.target.value);
                }}
                placeholder="Search table number or name"
                className={`${inputClass} pl-9`}
              />
            </label>
            <label>
              <span className="sr-only">Filter by branch</span>
              <select
                value={branchId}
                onChange={(event) => {
                  setPage(1);
                  setBranchId(event.target.value);
                }}
                className={inputClass}
              >
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter table status</span>
              <select
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value);
                }}
                className={inputClass}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        </div>
        {loading ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div
                key={item}
                className="h-44 animate-pulse rounded-2xl bg-slate-100"
              />
            ))}
          </div>
        ) : tables.length ? (
          <div className="grid min-w-0 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                allTables={tables}
                waiters={waitersByBranch[table.branchId] || []}
                busy={busyId === table.id}
                onOperate={operateTable}
                onAssign={assignWaiter}
                onOccupancy={setOccupancy}
                onDetails={() => openDetails(table)}
                onQr={() => openQr(table)}
                onEdit={() =>
                  setForm({
                    id: table.id,
                    tableNumber: table.tableNumber,
                    branchId: table.branchId,
                    seatingCapacity: String(table.seatingCapacity),
                  })
                }
                onToggle={() => toggleActive(table)}
              />
            ))}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <Armchair size={34} className="mx-auto text-slate-300" />
            <h3 className="mt-3 font-bold text-slate-800">
              {search || branchId || status !== "all"
                ? "No matching tables"
                : "No tables added yet"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {branches.length
                ? "Add a table to start organizing your dining room."
                : "Create a branch before adding restaurant tables."}
            </p>
            {!branches.length && (
              <Link
                to="/restaurant/branches"
                className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
              >
                Manage branches
              </Link>
            )}
          </div>
        )}
        {!loading && pagination.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
                aria-label="Previous page"
                className="rounded-lg border p-2 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((value) => value + 1)}
                aria-label="Next page"
                className="rounded-lg border p-2 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
      {form && (
        <Modal
          title={form.id ? "Edit table" : "Add a table"}
          onClose={() => !saving && setForm(null)}
        >
          <form onSubmit={saveTable} className="space-y-4">
            {formError && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
              >
                {formError}
              </p>
            )}
            <label className="block text-sm font-semibold text-slate-700">
              Table number or name
              <input
                required
                maxLength={50}
                autoFocus
                value={form.tableNumber}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    tableNumber: event.target.value,
                  }))
                }
                placeholder="e.g. Table 01"
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Branch
              <select
                required
                value={form.branchId}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    branchId: event.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="" disabled>
                  Select a branch
                </option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} · {branch.city}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Seating capacity
              <input
                required
                type="number"
                min="1"
                max="100"
                step="1"
                value={form.seatingCapacity}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    seatingCapacity: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={saving}
                onClick={() => setForm(null)}
                className="min-h-10 rounded-xl border px-4 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving && <LoaderCircle size={15} className="animate-spin" />}
                {saving ? "Saving…" : "Save table"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {details && (
        <Modal
          title={detailsLoading ? "Loading table…" : details.tableNumber}
          onClose={() => setDetails(null)}
        >
          {detailsLoading ? (
            <div className="flex justify-center py-12">
              <LoaderCircle className="animate-spin text-orange-500" />
            </div>
          ) : (
            <TableDetails table={details} />
          )}
        </Modal>
      )}
      {qrDialog && (
        <Modal
          title={`Shared restaurant QR · Table ${qrDialog.table.tableNumber}`}
          onClose={() => !qrDialog.loading && setQrDialog(null)}
        >
          <div className="space-y-4">
            {qrDialog.loading ? (
              <div className="mx-auto h-64 w-64 animate-pulse rounded-2xl bg-slate-100" />
            ) : qrDialog.imageDataUrl ? (
              <>
                <div className="mx-auto flex w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <img
                    src={qrDialog.imageDataUrl}
                    alt={`QR code for table ${qrDialog.table.tableNumber}`}
                    className="h-56 w-56"
                  />
                </div>
                <p className="break-all rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-600">
                  {qrDialog.qrUrl}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <a
                    href={qrDialog.imageDataUrl}
                    download={qrDialog.downloadName}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600"
                  >
                    Download PNG
                  </a>
                  <button
                    type="button"
                    onClick={printTableQr}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Printer size={15} />
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={() => copyQr(qrDialog.qrUrl)}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy size={15} />
                    Copy link
                  </button>
                  <p className="w-full text-xs text-slate-500">This is the same restaurant QR displayed for every table.</p>
                </div>
              </>
            ) : (
              <div className="py-3 text-center">
                <QrCode size={36} className="mx-auto text-slate-300" />
                {qrDialog.error ? (
                  <p
                    role="alert"
                    className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
                  >
                    {qrDialog.error}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    The shared restaurant QR could not be loaded.
                  </p>
                )}
                <button type="button" onClick={() => openQr(qrDialog.table)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white">Retry shared restaurant QR</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function TableCard({
  table,
  allTables,
  waiters,
  busy,
  onDetails,
  onEdit,
  onToggle,
  onQr,
  onAssign,
  onOccupancy,
  onOperate,
}) {
  const [operation, setOperation] = useState("transfer");
  const [targetTableId, setTargetTableId] = useState("");
  const [orderId, setOrderId] = useState("");
  const statusStyles = {
    available: "bg-emerald-50 text-emerald-700",
    occupied: "bg-orange-50 text-orange-700",
    reserved: "bg-amber-50 text-amber-700",
    cleaning: "bg-blue-50 text-blue-700",
    inactive: "bg-slate-100 text-slate-600",
  };
  const availableTargets = allTables.filter(
    (other) =>
      other.id !== table.id &&
      other.branchId === table.branchId &&
      other.isActive &&
      other.occupancyStatus === "available",
  );
  const mergeTargets = allTables.filter(
    (other) =>
      other.id !== table.id &&
      other.branchId === table.branchId &&
      other.isActive &&
      ["available", "occupied"].includes(other.occupancyStatus),
  );
  const activeOrders = table.orders || [];
  const reservations = table.reservations || [];
  const activeReservation = reservations.find((reservation) =>
    ["confirmed", "checked_in", "seated"].includes(reservation.status),
  );
  const releaseBlocked = activeOrders.length > 0 || reservations.length > 0;
  const targets = operation === "merge" ? mergeTargets : availableTargets;
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Armchair size={21} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-slate-900">
              {table.tableNumber}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
              <MapPin size={13} />
              {table.branch?.name || "Branch"}
              {table.branch?.city ? ` · ${table.branch.city}` : ""}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[table.occupancyStatus] || statusStyles.inactive}`}
        >
          {table.occupancyStatus || (table.isActive ? "available" : "inactive")}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Users size={16} className="text-slate-400" />
          {table.seatingCapacity} seats
        </p>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium ${table.qrAvailable ? "text-emerald-700" : "text-slate-400"}`}
        >
          <QrCode size={14} />
          {table.qrAvailable ? "QR generated" : "QR not generated"}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-slate-500">
          Assigned waiter
          <select
            value={table.assignedWaiterMemberId || ""}
            disabled={busy || !table.isActive}
            onChange={(event) => onAssign(table, event.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
          >
            <option value="">Unassigned</option>
            {waiters.map((waiter) => (
              <option key={waiter.id} value={waiter.id}>
                {waiter.name}
              </option>
            ))}
          </select>
        </label>
        <div className="text-[11px] font-semibold text-slate-500">
          Table actions
          {table.occupancyStatus === "available" && (
            <>
              <select
                value=""
                disabled={busy || !table.isActive}
                onChange={(event) => {
                  if (event.target.value)
                    onOccupancy(table, event.target.value);
                }}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
              >
                <option value="">Choose action</option>
                <option value="occupied">Mark Occupied</option>
                <option value="cleaning">Mark Cleaning</option>
              </select>
              <Link
                to="/restaurant/reservations"
                className="mt-1 inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <CalendarDays size={13} />
                Create reservation
              </Link>
            </>
          )}
          {table.occupancyStatus === "occupied" && (
            <>
              <button
                type="button"
                onClick={() => onOccupancy(table, "available")}
                disabled={busy || releaseBlocked}
                title={
                  releaseBlocked
                    ? "Complete the linked order or reservation before releasing this table."
                    : "Release this table"
                }
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Updating…" : "Mark Available / Release"}
              </button>
              {releaseBlocked && (
                <p className="mt-1 font-normal text-amber-700">
                  Complete the linked order or reservation first.
                </p>
              )}
            </>
          )}
          {table.occupancyStatus === "reserved" && (
            <p className="mt-1 font-normal text-amber-700">
              A reservation is linked below. Seat the guest from Reservations to
              mark this table occupied.
            </p>
          )}
          {table.occupancyStatus === "cleaning" && (
            <button
              type="button"
              onClick={() => onOccupancy(table, "available")}
              disabled={busy}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Mark Available
            </button>
          )}
          {!table.isActive && (
            <p className="mt-1 font-normal text-slate-400">
              Activate this table to manage its status.
            </p>
          )}
        </div>
      </div>
      {activeOrders.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <ClipboardList size={14} />
              Active dine-in orders ({activeOrders.length})
            </p>
            <Link
              to="/restaurant/orders"
              className="text-xs font-bold text-orange-700 hover:underline"
            >
              View orders
            </Link>
          </div>
          <div className="mt-2 space-y-1">
            {activeOrders.map((order) => (
              <p key={order.id} className="text-xs text-slate-600">
                #{order.orderNumber} · {order.status.replaceAll("_", " ")} · ₹
                {Number(order.total || 0).toFixed(2)}
              </p>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <select
              value={operation}
              onChange={(event) => {
                setOperation(event.target.value);
                setTargetTableId("");
              }}
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="transfer">Transfer one order</option>
              <option value="split">Split one order</option>
              <option value="merge">Merge table orders</option>
            </select>
            {operation !== "merge" && (
              <select
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="">Order</option>
                {activeOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    #{order.orderNumber}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <select
              value={targetTableId}
              onChange={(event) => setTargetTableId(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="">Destination table</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.tableNumber} · {target.occupancyStatus}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={
                busy || !targetTableId || (operation !== "merge" && !orderId)
              }
              onClick={() =>
                onOperate(table, operation, targetTableId, orderId)
              }
              className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      )}
      {reservations.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 p-3">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <CalendarDays size={14} />
            {activeReservation ? "Table booking" : "Reservation request"}
          </p>
          {reservations.map((reservation) => (
            <div key={reservation.id} className="mt-2 text-xs text-amber-900">
              <p className="font-semibold">
                {reservation.guestName} · {reservation.partySize} guests ·{" "}
                {reservation.status.replaceAll("_", " ")}
              </p>
              <p className="mt-0.5 text-amber-800">
                {reservationTime(
                  reservation.startsAt,
                  reservation.branch?.timeZone,
                  { dateStyle: "medium", timeStyle: "short" },
                )}{" "}
                –{" "}
                {reservationTime(
                  reservation.endsAt,
                  reservation.branch?.timeZone,
                  { timeStyle: "short" },
                )}{" "}
                · {reservation.guestPhone}
              </p>
            </div>
          ))}
          <Link
            to="/restaurant/reservations"
            className="mt-2 inline-flex text-xs font-bold text-amber-900 underline"
          >
            View booking
          </Link>
        </div>
      )}
      {table.occupancyStatus === "occupied" &&
        !activeOrders.length &&
        !reservations.length && (
          <p className="mt-3 rounded-lg bg-orange-50 p-2 text-xs text-orange-800">
            Occupied manually; no active order or reservation is linked.
          </p>
        )}
      {activeOrders.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-700">
            Active dine-in orders ({activeOrders.length})
          </p>
          <div className="mt-2 flex gap-2">
            <select
              value={operation}
              onChange={(event) => {
                setOperation(event.target.value);
                setTargetTableId("");
              }}
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="transfer">Transfer one order</option>
              <option value="split">Split one order</option>
              <option value="merge">Merge table orders</option>
            </select>
            {operation !== "merge" && (
              <select
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="">Order</option>
                {activeOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    #{order.orderNumber}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <select
              value={targetTableId}
              onChange={(event) => setTargetTableId(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="">Destination table</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.tableNumber} · {target.occupancyStatus}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={
                busy || !targetTableId || (operation !== "merge" && !orderId)
              }
              onClick={() =>
                onOperate(table, operation, targetTableId, orderId)
              }
              className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onDetails}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Eye size={14} />
          Details
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Edit3 size={14} />
          Edit
        </button>
        <button
          type="button"
          onClick={onQr}
          disabled={!table.isActive}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <QrCode size={14} />
          View shared QR
        </button>
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          className={`ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-50 ${table.isActive ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
        >
          {busy ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}{" "}
          {table.isActive ? "Deactivate" : "Activate"}
        </button>
      </div>
    </article>
  );
}

function TableDetails({ table }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Branch</p>
          <p className="mt-1 font-semibold text-slate-900">
            {table.branch?.name || "Branch"}
          </p>
          <p className="text-sm text-slate-500">{table.branch?.city}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Seating capacity</p>
          <p className="mt-1 font-semibold text-slate-900">
            {table.seatingCapacity} seats
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
        <span className="text-sm font-medium text-slate-700">Table status</span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${table.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
        >
          {table.isActive ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
        <span className="text-sm font-medium text-slate-700">QR code</span>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${table.qrAvailable ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
        >
          {table.qrAvailable ? "Generated" : "Not generated"}
        </span>
      </div>
      <p className="text-xs text-slate-400">
        Added {new Date(table.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
}

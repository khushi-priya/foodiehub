import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  LoaderCircle,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Ticket,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";
import { connectRestaurantSupportSocket } from "../../../services/socket";
import SupportAttachmentList from "../../support/SupportAttachmentList";
import {
  encodeAttachments,
  formatDate,
  statusLabel,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  validateFiles,
} from "../../support/supportUtils";

const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50";
const statuses = SUPPORT_STATUSES;
const statusTone = {
  open: "bg-blue-50 text-blue-700",
  in_progress: "bg-violet-50 text-violet-700",
  waiting_for_restaurant: "bg-amber-50 text-amber-800",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
};
const priorityTone = {
  low: "text-slate-500",
  normal: "text-blue-700",
  high: "text-orange-700",
  urgent: "text-red-700",
};
const guides = [
  {
    category: "Getting Started",
    title: "Find your restaurant workspace",
    text: "Sign in through the Restaurant Partner Portal. The sidebar shows pages available to your current restaurant role.",
    to: "/restaurant/dashboard",
  },
  {
    category: "Restaurant & Branch Setup",
    title: "Manage branch information and hours",
    text: "Open Branches to review branch records. Business settings contains branch operating hours and temporary closure controls for authorized users.",
    to: "/restaurant/business-settings",
  },
  {
    category: "Employees and Permissions",
    title: "Invite a team member",
    text: "Open Employees to add a team member, select a restaurant role, and assign branches. Invitations use a one-time account setup link.",
    to: "/restaurant/employees",
  },
  {
    category: "Employees and Permissions",
    title: "Manage custom role access",
    text: "On Employees, users with role-management access can create or edit custom roles and choose from the permissions available to the restaurant.",
    to: "/restaurant/employees",
  },
  {
    category: "Menu Management",
    title: "Open menu and categories",
    text: "Use Food Menu to review restaurant items and Category to review the restaurant menu categories available to your account.",
    to: "/restaurant/menu",
  },
  {
    category: "QR Codes and Tables",
    title: "Manage tables and QR codes",
    text: "Open Tables to view the table and QR tools available for your restaurant role.",
    to: "/restaurant/tables",
  },
  {
    category: "Orders and Kitchen",
    title: "Review orders and kitchen work",
    text: "Open Orders for restaurant order management. The Kitchen display page is available to roles with kitchen access.",
    to: "/restaurant/orders",
  },
  {
    category: "Payments",
    title: "Review restaurant subscription payments",
    text: "Open Plans & billing to view the subscription and payment options available to the restaurant account.",
    to: "/restaurant/subscription",
  },
  {
    category: "Subscriptions and Billing",
    title: "Manage restaurant coupons",
    text: "Open Coupons to review restaurant food coupons and their usage.",
    to: "/restaurant/coupons",
  },
];

function Metric({ title, value, icon: Icon, tone = "orange" }) {
  const tones = {
    orange: "bg-orange-50 text-orange-600",
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    green: "bg-emerald-50 text-emerald-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">{title}</p>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

function FilePicker({ files, onChange }) {
  const [fileError, setFileError] = useState("");
  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-orange-300 hover:text-orange-700">
        <Paperclip size={15} />
        Attach files
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
          className="sr-only"
          onChange={(event) => {
            const next = [...event.target.files];
            const error = validateFiles(next);
            setFileError(error);
            if (!error) onChange(next);
            event.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {files.map((file) => file.name).join(", ")}
        </p>
      )}
      {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
      <p className="mt-1 text-[10px] text-slate-400">
        PNG, JPG, WebP, PDF or text. Up to 3 files, 1 MB total.
      </p>
    </div>
  );
}

export default function RestaurantSupport() {
  const { user } = useAuth();
  const membership = (user?.restaurantMemberships || []).find(
    (item) => item.status === "active",
  );
  const permissionCodes = (membership?.role?.permissions || []).map(
    (permission) =>
      typeof permission === "string" ? permission : permission.code,
  );
  const canCreate = permissionCodes.includes("support.create");
  const [tickets, setTickets] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [options, setOptions] = useState({ branches: [], orders: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [files, setFiles] = useState([]);
  const [replyFiles, setReplyFiles] = useState([]);
  const [helpSearch, setHelpSearch] = useState("");
  const [openGuide, setOpenGuide] = useState("");
  const [form, setForm] = useState({
    subject: "",
    category: "",
    description: "",
    priority: "normal",
    relatedBranchId: "",
    relatedOrderId: "",
  });

  const load = useCallback(
    async (nextPage = page) => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get("/restaurant/support/tickets", {
          params: {
            page: nextPage,
            pageSize: 10,
            search: search || undefined,
            status: status || undefined,
            category: category || undefined,
            priority: priority || undefined,
          },
        });
        setTickets(data.tickets || []);
        setSummary(
          data.summary || { total: 0, open: 0, inProgress: 0, resolved: 0 },
        );
        setPagination(
          data.pagination || { page: nextPage, totalPages: 1, total: 0 },
        );
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Support tickets could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [page, search, status, category, priority],
  );

  useEffect(() => {
    load(page);
  }, [load, page]);
  useEffect(() => {
    api
      .get("/restaurant/support/options")
      .then(({ data }) =>
        setOptions({
          branches: data.branches || [],
          orders: data.orders || [],
        }),
      )
      .catch(() => {});
  }, []);
  useEffect(
    () =>
      connectRestaurantSupportSocket((event) => {
        setNotice(event.message || "Your support ticket was updated.");
        load(page);
        if (selected?.id === event.ticketId)
          api
            .get(`/restaurant/support/tickets/${event.ticketId}`)
            .then(({ data }) => setSelected(data.ticket))
            .catch(() => {});
      }),
    [load, page, selected?.id],
  );

  const visibleGuides = useMemo(() => {
    const query = helpSearch.trim().toLowerCase();
    return guides.filter(
      (guide) =>
        !query ||
        `${guide.category} ${guide.title} ${guide.text}`
          .toLowerCase()
          .includes(query),
    );
  }, [helpSearch]);

  const openTicket = async (ticketId) => {
    setSelected({ id: ticketId });
    setDetailLoading(true);
    setModalError("");
    try {
      const { data } = await api.get(`/restaurant/support/tickets/${ticketId}`);
      setSelected(data.ticket);
    } catch (requestError) {
      setModalError(
        requestError.response?.data?.message ||
          "Ticket details could not be loaded.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const createTicket = async (event) => {
    event.preventDefault();
    setModalError("");
    if (form.subject.trim().length < 4)
      return setModalError("Subject must be at least 4 characters.");
    if (!form.category) return setModalError("Choose a support category.");
    if (form.description.trim().length < 10)
      return setModalError("Description must be at least 10 characters.");
    setSaving(true);
    try {
      const attachments = await encodeAttachments(files);
      const { data } = await api.post("/restaurant/support/tickets", {
        ...form,
        subject: form.subject.trim(),
        description: form.description.trim(),
        relatedBranchId: form.relatedBranchId || null,
        relatedOrderId: form.relatedOrderId || null,
        attachments,
      });
      setNotice(`Ticket ${data.ticket.reference} was submitted.`);
      setCreateOpen(false);
      setFiles([]);
      setForm({
        subject: "",
        category: "",
        description: "",
        priority: "normal",
        relatedBranchId: "",
        relatedOrderId: "",
      });
      await load(1);
      setPage(1);
    } catch (requestError) {
      setModalError(
        requestError.response?.data?.message ||
          requestError.message ||
          "Ticket could not be submitted.",
      );
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const body = String(formData.get("body") || "").trim();
    if (!body) return setModalError("Write a reply before sending.");
    setSaving(true);
    setModalError("");
    try {
      const attachments = await encodeAttachments(replyFiles);
      await api.post(`/restaurant/support/tickets/${selected.id}/replies`, {
        body,
        attachments,
      });
      setReplyFiles([]);
      const { data } = await api.get(
        `/restaurant/support/tickets/${selected.id}`,
      );
      setSelected(data.ticket);
      setNotice("Your reply was sent.");
      await load(page);
      formElement.reset();
    } catch (requestError) {
      setModalError(
        requestError.response?.data?.message || "Reply could not be sent.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-orange-600">
            Help center
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
            Support
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Get help from FoodieHub support and follow your requests.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setModalError("");
            }}
            className={primary}
          >
            <Plus size={17} />
            Create Support Ticket
          </button>
        )}
      </header>
      {notice && (
        <div
          role="status"
          className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <span>{notice}</span>
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
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <AlertCircle size={16} />
          {error}
          <button
            type="button"
            className="ml-auto font-semibold"
            onClick={() => load(page)}
          >
            Retry
          </button>
        </div>
      )}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Total Tickets" value={summary.total} icon={Ticket} />
        <Metric
          title="Open Tickets"
          value={summary.open}
          icon={AlertCircle}
          tone="blue"
        />
        <Metric
          title="In Progress"
          value={summary.inProgress}
          icon={Clock3}
          tone="violet"
        />
        <Metric
          title="Resolved"
          value={summary.resolved}
          icon={CheckCircle2}
          tone="green"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h2 className="font-bold text-slate-900">My Support Tickets</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {pagination.total} requests for your restaurant
            </p>
          </div>
          <button
            type="button"
            onClick={() => load(page)}
            className={secondary}
          >
            <ArrowDown size={15} />
            Refresh
          </button>
        </div>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="relative xl:col-span-1">
            <Search
              size={15}
              className="absolute left-3 top-3.5 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search ticket ID or subject"
              className={`${input} pl-9`}
            />
          </label>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className={input}
          >
            <option value="">All statuses</option>
            {statuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
            className={input}
          >
            <option value="">All categories</option>
            {SUPPORT_CATEGORIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value);
              setPage(1);
            }}
            className={input}
          >
            <option value="">All priorities</option>
            {SUPPORT_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="animate-spin text-orange-500" size={18} />
            Loading support tickets…
          </div>
        ) : tickets.length ? (
          <div className="divide-y divide-slate-100">
            {tickets.map((ticket) => (
              <button
                type="button"
                key={ticket.id}
                onClick={() => openTicket(ticket.id)}
                className="grid w-full gap-3 p-4 text-left transition hover:bg-orange-50/40 md:grid-cols-[minmax(0,1fr)_150px_130px_170px] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">
                    {ticket.subject}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ticket.reference} · {ticket.category}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusTone[ticket.status]}`}
                >
                  {statusLabel(ticket.status)}
                </span>
                <span
                  className={`w-fit text-xs font-bold capitalize ${priorityTone[ticket.priority]}`}
                >
                  {ticket.priority} priority
                </span>
                <span className="text-xs text-slate-500">
                  Updated {formatDate(ticket.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <MessageCircle size={30} className="mx-auto text-slate-300" />
            <p className="mt-3 font-bold text-slate-800">
              No support tickets found
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Create a request or adjust your filters.
            </p>
            {canCreate && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className={`${primary} mt-4`}
              >
                Create a ticket
              </button>
            )}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 p-4 text-xs text-slate-500">
          <span>
            Page {pagination.page} of {pagination.totalPages || 1}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-lg border p-2 disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              disabled={page >= (pagination.totalPages || 1) || loading}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border p-2 disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.15em] text-orange-600">
              Self service
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">
              Help Center
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Browse guides for the tools available in your restaurant portal.
            </p>
          </div>
          <label className="relative w-full sm:max-w-xs">
            <Search
              size={15}
              className="absolute left-3 top-3.5 text-slate-400"
            />
            <input
              value={helpSearch}
              onChange={(event) => setHelpSearch(event.target.value)}
              placeholder="Search help articles"
              className={`${input} pl-9`}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {visibleGuides.map((guide) => (
            <article
              key={guide.title}
              className="rounded-xl border border-slate-200 p-4"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenGuide(openGuide === guide.title ? "" : guide.title)
                }
                aria-expanded={openGuide === guide.title}
                className="flex w-full items-start gap-3 text-left"
              >
                <CircleHelp
                  size={18}
                  className="mt-0.5 shrink-0 text-orange-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {guide.category}
                  </span>
                  <span className="mt-1 block text-sm font-bold text-slate-800">
                    {guide.title}
                  </span>
                </span>
                <ArrowUp
                  size={15}
                  className={`mt-1 text-slate-400 transition ${openGuide === guide.title ? "rotate-180" : ""}`}
                />
              </button>
              {openGuide === guide.title && (
                <div className="ml-8 mt-3">
                  <p className="text-sm leading-6 text-slate-600">
                    {guide.text}
                  </p>
                  <Link
                    to={guide.to}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-orange-600"
                  >
                    Open this section
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              )}
            </article>
          ))}
          {!visibleGuides.length && (
            <p className="p-8 text-center text-sm text-slate-500">
              No help articles match that search.
            </p>
          )}
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck size={14} />
          Your available pages depend on your restaurant permissions.
        </p>
      </section>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-5"
          role="presentation"
        >
          <form
            onSubmit={createTicket}
            className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-orange-600">
                  FoodieHub Support
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                  Create Support Ticket
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Describe what you need help with. Support will reply in this
                  ticket.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setModalError("");
                }}
                aria-label="Close create ticket dialog"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>
            {modalError && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                {modalError}
              </p>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Subject
                <input
                  required
                  minLength={4}
                  maxLength={180}
                  value={form.subject}
                  onChange={(event) =>
                    setForm({ ...form, subject: event.target.value })
                  }
                  className={`${input} mt-1`}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Category
                <select
                  required
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                  className={`${input} mt-1`}
                >
                  <option value="">Select category</option>
                  {SUPPORT_CATEGORIES.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Priority
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm({ ...form, priority: event.target.value })
                  }
                  className={`${input} mt-1`}
                >
                  {SUPPORT_PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {value[0].toUpperCase() + value.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Related branch (optional)
                <select
                  value={form.relatedBranchId}
                  onChange={(event) =>
                    setForm({ ...form, relatedBranchId: event.target.value })
                  }
                  className={`${input} mt-1`}
                >
                  <option value="">No branch selected</option>
                  {options.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Related order (optional)
                <select
                  value={form.relatedOrderId}
                  onChange={(event) =>
                    setForm({ ...form, relatedOrderId: event.target.value })
                  }
                  className={`${input} mt-1`}
                >
                  <option value="">No order selected</option>
                  {options.orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.orderNumber}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Description
                <textarea
                  required
                  minLength={10}
                  maxLength={10000}
                  rows={5}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  className={`${input} mt-1 resize-y`}
                />
              </label>
              <div className="sm:col-span-2">
                <FilePicker files={files} onChange={setFiles} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setModalError("");
                }}
                className={secondary}
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className={primary}>
                {saving ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <Send size={16} />
                )}
                Submit ticket
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-5"
          role="presentation"
        >
          <section className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-4 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-orange-600">
                  {selected.reference || "Support ticket"}
                </p>
                <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                  {selected.subject || "Loading ticket…"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setModalError("");
                }}
                aria-label="Close ticket details"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>
            {detailLoading ? (
              <div className="flex min-h-52 items-center justify-center">
                <LoaderCircle className="animate-spin text-orange-500" />
              </div>
            ) : (
              selected.subject && (
                <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                  {modalError && (
                    <p
                      role="alert"
                      className="rounded-lg bg-red-50 p-3 text-sm text-red-700 lg:col-span-2"
                    >
                      {modalError}
                    </p>
                  )}
                  <div className="min-w-0">
                    <article className="rounded-xl bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone[selected.status]}`}
                        >
                          {statusLabel(selected.status)}
                        </span>
                        <span
                          className={`text-xs font-bold capitalize ${priorityTone[selected.priority]}`}
                        >
                          {selected.priority} priority
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {selected.description}
                      </p>
                      <SupportAttachmentList
                        api={api}
                        endpoint="/restaurant/support/attachments"
                        attachments={selected.attachments}
                      />
                    </article>
                    <div className="mt-5">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                        <MessageCircle size={16} className="text-orange-500" />
                        Conversation
                      </h3>
                      <div className="space-y-3">
                        {(selected.messages || []).map((message) => (
                          <article
                            key={message.id}
                            className={`rounded-xl border p-4 ${message.authorType === "admin" ? "border-orange-100 bg-orange-50/50" : "border-slate-200 bg-white"}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-bold text-slate-800">
                                {message.authorType === "admin"
                                  ? "FoodieHub Support"
                                  : `${message.author?.firstName || "Restaurant team"} ${message.author?.lastName || ""}`}
                              </p>
                              <time className="text-[10px] text-slate-400">
                                {formatDate(message.createdAt)}
                              </time>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                              {message.body}
                            </p>
                            <SupportAttachmentList
                              api={api}
                              endpoint="/restaurant/support/attachments"
                              attachments={message.attachments}
                            />
                          </article>
                        ))}
                        {!selected.messages?.length && (
                          <p className="text-xs text-slate-400">
                            No replies yet. Your opening description appears
                            above.
                          </p>
                        )}
                      </div>
                    </div>
                    {selected.status !== "closed" && (
                      <form
                        onSubmit={sendReply}
                        className="mt-5 rounded-xl border border-slate-200 p-4"
                      >
                        <label className="block text-xs font-bold text-slate-700">
                          Reply to support
                          <textarea
                            required
                            name="body"
                            maxLength={6000}
                            rows={3}
                            placeholder="Add information or answer a support question…"
                            className={`${input} mt-2 resize-y`}
                          />
                        </label>
                        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                          <FilePicker
                            files={replyFiles}
                            onChange={setReplyFiles}
                          />
                          <button
                            type="submit"
                            disabled={saving}
                            className={primary}
                          >
                            {saving ? (
                              <LoaderCircle
                                className="animate-spin"
                                size={15}
                              />
                            ) : (
                              <Send size={15} />
                            )}
                            Send reply
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                  <aside className="space-y-4">
                    <div className="rounded-xl border border-slate-200 p-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Ticket details
                      </h3>
                      <dl className="mt-3 space-y-3 text-xs">
                        <div>
                          <dt className="text-slate-400">Category</dt>
                          <dd className="mt-0.5 font-semibold text-slate-700">
                            {selected.category}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">Created</dt>
                          <dd className="mt-0.5 font-semibold text-slate-700">
                            {formatDate(selected.createdAt)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">Last updated</dt>
                          <dd className="mt-0.5 font-semibold text-slate-700">
                            {formatDate(selected.updatedAt)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">Last reply</dt>
                          <dd className="mt-0.5 font-semibold text-slate-700">
                            {formatDate(selected.lastReplyAt)}
                          </dd>
                        </div>
                        {selected.relatedBranch && (
                          <div>
                            <dt className="text-slate-400">Related branch</dt>
                            <dd className="mt-0.5 font-semibold text-slate-700">
                              {selected.relatedBranch.name}
                            </dd>
                          </div>
                        )}
                        {selected.relatedOrder && (
                          <div>
                            <dt className="text-slate-400">Related order</dt>
                            <dd className="mt-0.5 font-semibold text-slate-700">
                              {selected.relatedOrder.orderNumber}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                    <div className="rounded-xl bg-orange-50 p-4">
                      <p className="text-xs font-bold text-orange-900">
                        Need more help?
                      </p>
                      <p className="mt-1 text-xs leading-5 text-orange-800">
                        Reply here to keep the conversation with this support
                        request.
                      </p>
                    </div>
                  </aside>
                </div>
              )
            )}
          </section>
        </div>
      )}
    </main>
  );
}

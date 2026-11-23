

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Truck,
  Wallet,
} from "lucide-react";

const views = {
  "/restaurant/payments": {
    title: "Payment Overview",
    endpoint: "overview",
    permission: "payments.view",
  },
  "/restaurant/payments/transactions": {
    title: "Transactions",
    endpoint: "transactions",
    permission: "payments.transactions.view",
  },
  "/restaurant/payments/cod-collections": {
    title: "COD Collections",
    endpoint: "cod-collections",
    permission: "payments.cod.view",
  },
  "/restaurant/payments/cash-reconciliation": {
    title: "Cash Reconciliation",
    endpoint: "cash-reconciliation",
    permission: "payments.cash_reconcile",
  },
  "/restaurant/payments/settlements": {
    title: "Settlements",
    endpoint: "settlements",
    permission: "payments.settlements.view",
  },
  "/restaurant/payments/refunds": {
    title: "Refunds",
    endpoint: "refunds",
    permission: "payments.refunds.view",
  },
};

const money = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const dateTime = (value) =>
  value ? new Date(value).toLocaleString("en-IN") : "—";

const statusTone = (status) =>
  ({
    paid: "bg-emerald-50 text-emerald-700",
    collected: "bg-emerald-50 text-emerald-700",
    reconciled: "bg-emerald-50 text-emerald-700",
    confirmed: "bg-emerald-50 text-emerald-700",
    processed: "bg-emerald-50 text-emerald-700",
    failed: "bg-rose-50 text-rose-700",
    disputed: "bg-rose-50 text-rose-700",
    cancelled: "bg-slate-100 text-slate-600",
    pending: "bg-amber-50 text-amber-800",
    awaiting_collection: "bg-amber-50 text-amber-800",
    pending_handover: "bg-amber-50 text-amber-800",
  })[status] || "bg-slate-100 text-slate-600";

const statusLabel = (status) =>
  String(status || "unavailable").replaceAll("_", " ");

const unwrap = (response) => response?.data?.data;

const errorText = (error) =>
  error.response?.data?.message || "Unable to load payment data.";

export default function RestaurantPayments() {
  const { user } = useAuth();
  const location = useLocation();

  const view = views[location.pathname] || views["/restaurant/payments"];

  const membership = useMemo(
    () =>
      (user?.restaurantMemberships || []).find(
        (entry) =>
          entry.status === "active" &&
          (entry.role?.code === "restaurant_owner" ||
            entry.role === "restaurant_owner"),
      ) ||
      (user?.restaurantMemberships || []).find(
        (entry) => entry.status === "active",
      ),
    [user],
  );

  const restaurantId = membership?.restaurantId || membership?.restaurant?.id;

  const [data, setData] = useState(null);
  const [branches, setBranches] = useState([]);

  const [filters, setFilters] = useState({
    branchId: "",
    from: "",
    to: "",
    method: "all",
    status: "all",
    collectionStatus: "all",
    handoverStatus: "all",
    employeeId: "",
    search: "",
  });

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [detail, setDetail] = useState(null);

  const params = useMemo(
    () => ({
      restaurantId,
      page,
      limit: 20,
      ...Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value),
      ),
    }),
    [restaurantId, page, filters],
  );

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await api.get(
        `/restaurant/payments/${view.endpoint}`,
        { params },
      );

      setData(unwrap(response));
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [restaurantId, view.endpoint, params]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;

    api
      .get("/restaurant/branches", {
        params: {
          page: 1,
          limit: 100,
          status: "all",
          ...(restaurantId ? { restaurantId } : {}),
        },
      })
      .then((response) => {
        if (active) {
          setBranches(unwrap(response)?.branches || []);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [restaurantId]);

  const setFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  };

  const showMessage = async (message) => {
    setNotice(message);
    await load();
  };

  const inspect = async (id) => {
    try {
      setDetail(
        unwrap(
          await api.get(`/restaurant/payments/transactions/${id}`, {
            params: { restaurantId },
          }),
        ),
      );
    } catch (requestError) {
      setError(errorText(requestError));
    }
  };

  const verifyHandover = async (handover) => {
    const response = window.prompt(
      `Cash received (expected ${money(handover.expectedAmount)}). Enter the actual amount. Leave blank to dispute.`,
    );

    if (response === null) return;

    const payload = response.trim()
      ? { receivedAmount: response.trim() }
      : {
          disputeReason:
            window.prompt(
              "Describe the handover discrepancy (at least 3 characters):",
            ) || "",
        };

    if (
      payload.disputeReason !== undefined &&
      payload.disputeReason.trim().length < 3
    ) {
      return;
    }

    setBusyId(handover.id);
    setError("");
    setNotice("");

    try {
      await api.post(
        `/restaurant/payments/cash-handovers/${handover.id}/confirm`,
        payload,
        { params: { restaurantId } },
      );

      await showMessage("Cash handover verification recorded.");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusyId("");
    }
  };

  const resolveCodCollection = async (collection) => {
    const reason = window.prompt(
      "Describe the authorized resolution for this failed COD collection:",
    );

    if (reason === null || reason.trim().length < 5) return;

    if (
      !window.confirm(
        "Record this COD failure as reviewed? Payment will remain pending until valid cash is collected.",
      )
    ) {
      return;
    }

    setBusyId(collection.id);
    setError("");
    setNotice("");

    try {
      await api.post(
        `/restaurant/payments/cod-collections/${collection.id}/resolve`,
        { reason: reason.trim() },
        { params: { restaurantId } },
      );

      await showMessage(
        "COD collection exception was reviewed. The customer payment remains pending.",
      );
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusyId("");
    }
  };

  const requestRefund = async (order) => {
    const amountInput = window.prompt(
      `Enter a partial refund amount for ${order.orderNumber}, or leave blank to refund the full ${money(order.total)}.`,
    );

    if (amountInput === null) return;

    const amount = amountInput.trim() ? Number(amountInput) : null;

    if (
      amount !== null &&
      (!Number.isFinite(amount) ||
        amount <= 0 ||
        amount > Number(order.total) ||
        Math.round(amount * 100) !== amount * 100)
    ) {
      setError("Enter a valid amount up to the captured order total.");
      return;
    }

    const reason = window.prompt(
      `Request a refund of ${money(amount ?? order.total)} for ${order.orderNumber}. Enter a reason:`,
    );

    if (reason === null || reason.trim().length < 3) return;

    if (
      !window.confirm(
        `Submit a refund request for ${money(amount ?? order.total)} on ${order.orderNumber}?`,
      )
    ) {
      return;
    }

    setBusyId(order.id);
    setError("");
    setNotice("");

    try {
      await api.post(
        `/restaurant/orders/${order.id}/refund`,
        {
          reason: reason.trim(),
          ...(amount !== null ? { amount } : {}),
        },
        { params: { restaurantId } },
      );

      await showMessage(
        "Refund request sent to Razorpay. The status will update after provider confirmation.",
      );
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusyId("");
    }
  };

  const reconcileRefund = async (order) => {
    setBusyId(order.id);
    setError("");

    try {
      await api.get(`/restaurant/orders/${order.id}/refund`, {
        params: { restaurantId },
      });

      await showMessage("Refund status synchronized with Razorpay.");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusyId("");
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">
            Restaurant finance
          </p>

          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
            {view.title}
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Payments, cash collection and payout records for{" "}
            {membership?.restaurant?.name || "your restaurant"}.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <span>{error}</span>

          <button onClick={load} className="shrink-0 font-bold">
            Retry
          </button>
        </div>
      )}

      {notice && (
        <p
          role="status"
          className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}

      <Filters
        view={view.endpoint}
        branches={branches}
        filters={filters}
        setFilter={setFilter}
      />

      {loading && !data ? (
        <div className="mt-6 flex min-h-56 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
          <LoaderCircle size={18} className="mr-2 animate-spin" />
          Loading financial records…
        </div>
      ) : (
        <>
          {view.endpoint === "overview" && (
            <Overview data={data} onInspect={inspect} />
          )}

          {view.endpoint === "transactions" && (
            <Transactions
              data={data}
              onInspect={inspect}
              page={page}
              setPage={setPage}
            />
          )}

          {view.endpoint === "cod-collections" && (
            <CodCollections
              data={data}
              page={page}
              setPage={setPage}
              onResolve={resolveCodCollection}
              busyId={busyId}
            />
          )}

          {view.endpoint === "cash-reconciliation" && (
            <Reconciliation
              data={data}
              onVerify={verifyHandover}
              busyId={busyId}
            />
          )}

          {view.endpoint === "settlements" && (
            <Settlements data={data} page={page} setPage={setPage} />
          )}

          {view.endpoint === "refunds" && (
            <Refunds
              data={data}
              onRequest={requestRefund}
              onReconcile={reconcileRefund}
              busyId={busyId}
              page={page}
              setPage={setPage}
            />
          )}
        </>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDetail(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-orange-600">
                  Transaction detail
                </p>

                <h2 className="mt-1 text-xl font-extrabold">
                  {detail.orderNumber}
                </h2>
              </div>

              <button
                onClick={() => setDetail(null)}
                className="rounded-lg border px-3 py-1.5 text-sm font-semibold"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Branch", detail.branch?.name],
                ["Payment method", detail.paymentMethod],
                ["Payment status", statusLabel(detail.paymentStatus)],
                ["Order total", money(detail.total)],
                ["Gateway order", detail.razorpayOrderId || "—"],
                ["Gateway payment", detail.razorpayPaymentId || "—"],
                ["Created", dateTime(detail.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] font-bold uppercase text-slate-500">
                    {label}
                  </p>

                  <p className="mt-1 break-all text-sm font-semibold text-slate-800">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <h3 className="mt-5 font-bold">Payment attempts</h3>

            {detail.paymentAttempts?.map((attempt) => (
              <div
                key={attempt.gatewayOrderId}
                className="mt-2 rounded-xl border p-3 text-sm"
              >
                <p>
                  {statusLabel(attempt.status)} · {money(attempt.amount)}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Gateway order {attempt.gatewayOrderId} ·{" "}
                  {attempt.gatewayPaymentId || "No payment captured"}
                </p>
              </div>
            ))}

            {detail.codCollections?.length > 0 && (
              <>
                <h3 className="mt-5 font-bold">COD collection history</h3>

                {detail.codCollections.map((row) => (
                  <div
                    key={row.id}
                    className="mt-2 rounded-xl border p-3 text-sm"
                  >
                    {statusLabel(row.status)} · expected{" "}
                    {money(row.expectedAmount)} · collected{" "}
                    {money(row.collectedAmount)}

                    <p className="mt-1 text-xs text-slate-500">
                      {dateTime(row.createdAt)} {row.reason || ""}
                    </p>
                  </div>
                ))}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function Filters({ view, branches, filters, setFilter }) {
  const active = [
    "overview",
    "transactions",
    "cod-collections",
    "cash-reconciliation",
    "settlements",
    "refunds",
  ].includes(view);

  if (!active) return null;

  return (
    <section className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
      <select
        aria-label="Branch"
        value={filters.branchId}
        onChange={(e) => setFilter("branchId", e.target.value)}
        className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
      >
        <option value="">All authorized branches</option>

        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>

      <label className="text-xs font-semibold text-slate-500">
        From
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilter("from", e.target.value)}
          className="mt-1 block h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800"
        />
      </label>

      <label className="text-xs font-semibold text-slate-500">
        To
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilter("to", e.target.value)}
          className="mt-1 block h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800"
        />
      </label>

      {["overview", "transactions"].includes(view) && (
        <>
          <select
            value={filters.method}
            onChange={(e) => setFilter("method", e.target.value)}
            className="h-10 rounded-xl border px-3 text-sm"
          >
            <option value="all">All payment methods</option>
            <option value="razorpay">Online payment</option>
            <option value="cash_on_delivery">Cash on delivery</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value)}
            className="h-10 rounded-xl border px-3 text-sm"
          >
            <option value="all">All payment statuses</option>

            {[
              "pending",
              "paid",
              "failed",
              "refunded",
              "partially_refunded",
              "refund_pending",
              "refund_failed",
            ].map((item) => (
              <option key={item} value={item}>
                {statusLabel(item)}
              </option>
            ))}
          </select>

          {view === "transactions" && (
            <label className="relative sm:col-span-2 lg:col-span-2">
              <Search
                size={15}
                className="absolute left-3 top-3 text-slate-400"
              />

              <input
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
                placeholder="Search order or gateway reference"
                className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm"
              />
            </label>
          )}
        </>
      )}

      {view === "cod-collections" && (
        <>
          <select
            value={filters.collectionStatus}
            onChange={(e) =>
              setFilter("collectionStatus", e.target.value)
            }
            className="h-10 rounded-xl border px-3 text-sm"
          >
            <option value="all">All collection statuses</option>

            {[
              "awaiting_collection",
              "collected",
              "collection_failed",
              "disputed",
              "reconciled",
            ].map((item) => (
              <option key={item} value={item}>
                {statusLabel(item)}
              </option>
            ))}
          </select>

          <select
            value={filters.handoverStatus}
            onChange={(e) =>
              setFilter("handoverStatus", e.target.value)
            }
            className="h-10 rounded-xl border px-3 text-sm"
          >
            <option value="all">All handover statuses</option>

            {[
              "not_handed_over",
              "pending_handover",
              "reconciled",
              "disputed",
            ].map((item) => (
              <option key={item} value={item}>
                {statusLabel(item)}
              </option>
            ))}
          </select>
        </>
      )}

      {view === "cash-reconciliation" && (
        <label className="text-xs font-semibold text-slate-500">
          Associate member ID
          <input
            value={filters.employeeId}
            onChange={(e) =>
              setFilter("employeeId", e.target.value.trim())
            }
            placeholder="Optional employee ID"
            className="mt-1 block h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800"
          />
        </label>
      )}
    </section>
  );
}

function Metric({ label, value, note, icon: Icon, tone = "orange" }) {
  const colors = {
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
    green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    rose: "bg-rose-50 text-rose-600 ring-rose-100",
  };

  return (
    <article className="flex min-h-[155px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-[190px] text-sm font-semibold leading-5 text-slate-600">
          {label}
        </p>

        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${colors[tone]}`}
        >
          <Icon size={19} strokeWidth={2} />
        </span>
      </div>

      <div className="mt-5">
        <p className="break-words text-2xl font-extrabold tracking-tight text-slate-900">
          {value}
        </p>

        {note && (
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {note}
          </p>
        )}
      </div>
    </article>
  );
}

function Overview({ data, onInspect }) {
  const totals = data?.totals || {};

  const cards = [
    [
      "Online payments received",
      money(totals.onlineCollected),
      "Successfully captured online payments",
      CreditCard,
      "green",
    ],
    [
      "COD collected",
      money(totals.codCollected),
      "Cash confirmed by delivery associates",
      Banknote,
      "green",
    ],
    [
      "COD pending collection",
      money(totals.codAwaitingCollection),
      "Cash expected from pending COD orders",
      Truck,
      "amber",
    ],
    [
      "Cash awaiting handover",
      money(totals.pendingCodHandover),
      "Collected cash pending restaurant verification",
      Banknote,
      "amber",
    ],
    [
      "Total refunds",
      money(totals.refunds),
      "Refunds successfully processed",
      RotateCcw,
      "rose",
    ],
    [
      "Pending settlement",
      money(totals.pendingSettlement),
      "Amount payable to your restaurant",
      Receipt,
      "blue",
    ],
    [
      "Total settled",
      money(totals.successfullySettled),
      "Payments transferred and recorded",
      CheckCircle2,
      "green",
    ],
    [
      "Failed online payments",
      totals.failedPayments || 0,
      "Unsuccessful payment gateway attempts",
      ShieldCheck,
      "rose",
    ],
  ];

  return (
    <>
      <section className="mt-6">
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
              Financial summary
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Monitor collections, refunds and restaurant settlements.
            </p>
          </div>

          <span className="text-xs font-medium text-slate-400">
            Based on selected filters
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value, note, icon, tone]) => (
            <Metric
              key={label}
              label={label}
              value={value}
              note={note}
              icon={icon}
              tone={tone}
            />
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        <Records
          title="Recent transactions"
          rows={data?.recentTransactions || []}
          empty="No payment transactions in this period."
          render={(order) => (
            <button
              type="button"
              onClick={() => onInspect(order.id)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="break-all font-bold text-slate-900">
                  {order.orderNumber} · {money(order.total)}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {order.branch?.name || "Branch"} ·{" "}
                  {statusLabel(order.paymentMethod)} ·{" "}
                  {dateTime(order.createdAt)}
                </p>
              </div>

              <Badge status={order.paymentStatus} />
            </button>
          )}
        />

        <Records
          title="Recent settlements"
          rows={data?.recentSettlements || []}
          empty="No external settlement transfers have been recorded."
          render={(row) => (
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-bold text-slate-900">
                  {money(row.amount)}
                </p>

                <p className="mt-1 break-all text-xs text-slate-500">
                  Reference {row.transactionReference} ·{" "}
                  {dateTime(row.settledAt)}
                </p>
              </div>

              <Badge status={row.status} />
            </div>
          )}
        />
      </div>

      <p className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
        {data?.settlementNote ||
          "Online customer payments, COD cash, restaurant payable and bank payouts are reported separately."}
      </p>
    </>
  );
}

function Records({ title, rows, empty, render }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="font-bold text-slate-900">{title}</h2>
      </div>

      {rows.length ? (
        <div className="divide-y divide-slate-100">
          {rows.map((row) => (
            <div key={row.id}>{render(row)}</div>
          ))}
        </div>
      ) : (
        <Empty message={empty} />
      )}
    </section>
  );
}

function Badge({ status }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusTone(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function Empty({ message }) {
  return (
    <div className="p-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function Pager({ pagination, page, setPage }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  return (
    <footer className="flex items-center justify-between border-t p-3 text-xs text-slate-500">
      <span>
        {pagination.total} records · page {page} of {pagination.totalPages}
      </span>

      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="rounded-lg border px-3 py-1.5 disabled:opacity-40"
        >
          Previous
        </button>

        <button
          disabled={page >= pagination.totalPages}
          onClick={() => setPage(page + 1)}
          className="rounded-lg border px-3 py-1.5 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </footer>
  );
}

function Transactions({ data, onInspect, page, setPage }) {
  const rows = data?.items || [];

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-100">
        {rows.map((row) => (
          <article
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div className="min-w-[180px] flex-1">
              <p className="font-bold text-slate-900">
                {row.orderNumber} · {money(row.total)}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {row.branch?.name || "Branch unavailable"} ·{" "}
                {statusLabel(row.paymentMethod)} · {dateTime(row.createdAt)}
              </p>

              <p className="mt-1 break-all text-[11px] text-slate-400">
                {row.razorpayPaymentId ||
                  row.razorpayOrderId ||
                  "No gateway reference"}
              </p>
            </div>

            <Badge status={row.paymentStatus} />

            <span className="text-xs text-slate-500">
              Refund: {row.refund ? statusLabel(row.refund.status) : "—"}
            </span>

            <button
              onClick={() => onInspect(row.id)}
              className="rounded-lg border px-3 py-2 text-xs font-bold"
            >
              Details
            </button>
          </article>
        ))}

        {!rows.length && (
          <Empty message="No transactions match your filters." />
        )}
      </div>

      <Pager pagination={data?.pagination} page={page} setPage={setPage} />
    </section>
  );
}

function CodCollections({ data, page, setPage, onResolve, busyId }) {
  const rows = data?.items || [];

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-slate-200 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{row.orderNumber}</h3>

                <p className="mt-1 text-xs text-slate-500">
                  {row.branch?.name} · {dateTime(row.createdAt)}
                </p>
              </div>

              <Badge status={row.collectionStatus} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Cell label="Customer" value={row.customerName} />

              <Cell
                label="Delivery associate"
                value={`${row.assignment?.deliveryEmployee?.user?.firstName || "Unassigned"} ${row.assignment?.deliveryEmployee?.user?.lastName || ""}`}
              />

              <Cell label="Order amount" value={money(row.total)} />
              <Cell label="Expected COD" value={money(row.expectedAmount)} />

              <Cell
                label="Collected"
                value={
                  row.actualAmount == null ? "—" : money(row.actualAmount)
                }
              />

              <Cell label="Handover" value={statusLabel(row.handoverStatus)} />
              <Cell label="Outstanding" value={money(row.outstandingAmount)} />

              <Cell
                label="Collection date"
                value={dateTime(row.collection?.collectedAt)}
              />
            </div>

            {row.collection?.reason && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                {row.collection.reason}
              </p>
            )}

            {row.collectionStatus === "collection_failed" &&
              row.collection?.resolutionStatus !== "resolved" && (
                <button
                  disabled={busyId === row.collection.id}
                  onClick={() => onResolve(row.collection)}
                  className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50"
                >
                  Review failed collection
                </button>
              )}

            {row.collection?.resolutionStatus === "resolved" && (
              <p className="mt-3 text-xs text-slate-600">
                Exception reviewed: {row.collection.resolutionReason}
              </p>
            )}
          </article>
        ))}

        {!rows.length && (
          <div className="md:col-span-2 xl:col-span-3">
            <Empty message="No COD orders match these filters." />
          </div>
        )}
      </div>

      <Pager pagination={data?.pagination} page={page} setPage={setPage} />
    </section>
  );
}

function Cell({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 break-words font-semibold text-slate-700">
        {value || "—"}
      </p>
    </div>
  );
}

function EmptyState({ icon: Icon = Receipt, title, message }) {
  return (
    <div className="flex min-h-[210px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-100">
        <Icon size={25} strokeWidth={1.7} />
      </div>

      <h3 className="mt-4 text-sm font-bold text-slate-800">
        {title}
      </h3>

      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
        {message}
      </p>
    </div>
  );
}

function Reconciliation({ data, onVerify, busyId }) {
  const summaries = data?.summaries || [];
  const handovers = data?.handovers || [];

  return (
    <div className="mt-7 space-y-8">
      {/* Daily collections */}
      <section>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Banknote size={20} />
              </div>

              <h2 className="text-xl font-extrabold text-slate-900">
                Daily associate collections
              </h2>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              Track cash collected by delivery associates across your branches.
            </p>
          </div>

          <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
            {summaries.length} records
          </span>
        </div>

        {summaries.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summaries.map((row) => (
              <article
                key={`${row.date}-${row.branchId}-${row.employeeId}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900">
                      {row.employee || "Delivery associate"}
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      {row.branchName || "Branch"}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-extrabold text-emerald-700">
                    {money(row.collectedCash)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1.5">
                    {row.date}
                  </span>

                  <span className="rounded-lg bg-slate-100 px-2.5 py-1.5">
                    {row.orders} orders
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold text-slate-500">
                      Expected cash
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {money(row.expectedCash)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold text-slate-500">
                      Collected cash
                    </p>
                    <p className="mt-1 text-sm font-bold text-emerald-700">
                      {money(row.collectedCash)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-amber-50 p-3">
                    <p className="text-[11px] font-semibold text-amber-700">
                      Outstanding
                    </p>
                    <p className="mt-1 text-sm font-bold text-amber-800">
                      {money(row.outstandingCash)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-blue-50 p-3">
                    <p className="text-[11px] font-semibold text-blue-700">
                      Reconciled
                    </p>
                    <p className="mt-1 text-sm font-bold text-blue-800">
                      {money(row.reconciledCash)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Banknote}
            title="No cash collections found"
            message="Daily associate collection records will appear here when delivery associates collect cash for completed COD orders."
          />
        )}
      </section>

      {/* Cash handovers */}
      <section>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Wallet size={20} />
              </div>

              <h2 className="text-xl font-extrabold text-slate-900">
                Cash handovers
              </h2>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              Review submitted cash and verify the amount received from delivery associates.
            </p>
          </div>

          <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
            {handovers.length} records
          </span>
        </div>

        {handovers.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {handovers.map((row) => (
              <article
                key={row.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-orange-200 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900">
                      {row.deliveryEmployee?.user?.firstName || "Delivery associate"}{" "}
                      {row.deliveryEmployee?.user?.lastName || ""}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {row.branch?.name || "Branch"}
                    </p>
                  </div>

                  <Badge status={row.status} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Expected</p>
                    <p className="mt-1 font-bold text-slate-800">
                      {money(row.expectedAmount)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-blue-50 p-3">
                    <p className="text-xs text-blue-600">Submitted</p>
                    <p className="mt-1 font-bold text-blue-800">
                      {money(row.submittedAmount)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-600">Received</p>
                    <p className="mt-1 font-bold text-emerald-800">
                      {row.receivedAmount == null
                        ? "Not verified"
                        : money(row.receivedAmount)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-slate-500">
                  <p>
                    <span className="font-semibold text-slate-700">
                      Submitted:
                    </span>{" "}
                    {dateTime(row.submittedAt)}
                  </p>

                  {row.receiver && (
                    <p>
                      <span className="font-semibold text-slate-700">
                        Received by:
                      </span>{" "}
                      {row.receiver.firstName} {row.receiver.lastName}
                    </p>
                  )}

                  {row.items?.length > 0 && (
                    <p className="break-words">
                      <span className="font-semibold text-slate-700">
                        Orders:
                      </span>{" "}
                      {row.items
                        .map((item) => item.collection?.order?.orderNumber)
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                </div>

                {row.status === "pending" && (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <button
                      disabled={busyId === row.id}
                      onClick={() => onVerify(row)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      {busyId === row.id ? (
                        <LoaderCircle size={16} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      Verify cash received
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Wallet}
            title="No cash handovers submitted"
            message="When a delivery associate submits collected cash for verification, the handover details will appear here."
          />
        )}
      </section>
    </div>
  );
}

function Settlements({ data, page, setPage }) {
  const pendingRecords = data?.pendingRecords || [];
  const settlements = data?.settlements || [];

  return (
    <div className="mt-7 space-y-7">
      {/* Settlement overview */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-extrabold text-slate-900">
            Settlement overview
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Monitor restaurant payable amounts and externally recorded transfers.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Metric
            label="Pending restaurant payable"
            value={money(data?.pendingAmount)}
            note="Calculated from completed orders in the commission ledger"
            icon={Wallet}
            tone="orange"
          />

          <Metric
            label="Unsettled order records"
            value={pendingRecords.length}
            note="Orders awaiting settlement"
            icon={Receipt}
            tone="blue"
          />

          <Metric
            label="Payout processing"
            value="Manual transfer"
            note="No automatic marketplace payout is configured"
            icon={ShieldCheck}
            tone="amber"
          />
        </div>
      </section>

      {/* Payable orders */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">
              Pending payable orders
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Order-wise breakdown of the restaurant's pending payable amount.
            </p>
          </div>

          <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700">
            {pendingRecords.length} orders
          </span>
        </div>

        {pendingRecords.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {pendingRecords.map((row, index) => (
              <article
                key={row.id || row.order?.id || index}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-orange-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Order reference
                    </p>

                    <h3 className="mt-1 break-all font-bold text-slate-900">
                      {row.order?.orderNumber || "Order"}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {row.branch?.name || "Branch"}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                    Pending
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Eligible amount</p>
                    <p className="mt-1 font-bold text-slate-800">
                      {money(row.eligibleAmount)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Commission rate</p>
                    <p className="mt-1 font-bold text-slate-800">
                      {row.commissionRate}%
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 p-4">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700">
                      Restaurant payable
                    </p>
                    <p className="mt-1 text-xs text-emerald-600">
                      After commission
                    </p>
                  </div>

                  <p className="text-xl font-extrabold text-emerald-800">
                    {money(row.restaurantPayable)}
                  </p>
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Transaction date: {dateTime(row.transactionAt)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No pending settlements"
            message="There are currently no outstanding restaurant payable orders for the selected filters."
          />
        )}
      </section>

      {/* Settlement information */}
      {data?.message && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <ShieldCheck className="mt-0.5 shrink-0 text-amber-700" size={20} />
          <p className="text-sm leading-6 text-amber-900">
            {data.message}
          </p>
        </div>
      )}

      {/* Recorded settlement batches */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">
              Recorded settlements
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              External bank transfers recorded by the platform.
            </p>
          </div>

          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
            {settlements.length} batches
          </span>
        </div>

        {settlements.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {settlements.map((batch) => (
              <article
                key={batch.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Settlement amount
                    </p>

                    <h3 className="mt-1 text-2xl font-extrabold text-slate-900">
                      {money(batch.amount)}
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Currency: {batch.currency || "INR"}
                    </p>
                  </div>

                  <Badge status={batch.status} />
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">
                    External transaction reference
                  </p>

                  <p className="mt-1 break-all text-sm font-semibold text-slate-800">
                    {batch.transactionReference || "Not provided"}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>Settlement date</span>
                  <span className="font-semibold text-slate-700">
                    {dateTime(batch.settledAt)}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Payable items</span>
                  <span className="font-bold text-slate-800">
                    {batch.items?.length || 0}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Receipt}
            title="No settlement transfers recorded"
            message="External settlement transfers will appear here after they have been recorded by the platform."
          />
        )}
      </section>

      <Pager pagination={data?.pagination} page={page} setPage={setPage} />

      <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
        FoodieHub does not initiate bank payouts. Settlements shown here represent
        externally transferred amounts recorded by the platform.
      </p>
    </div>
  );
}

function Refunds({ data, onRequest, onReconcile, busyId, page, setPage }) {
  const rows = data?.items || [];

  return (
    <div className="mt-7">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">
            Refund management
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Review refund requests, track provider status and manage eligible orders.
          </p>
        </div>

        <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
          {rows.length} records
        </span>
      </div>

      {rows.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((order) => (
            <article
              key={order.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Order reference
                  </p>

                  <h3 className="mt-1 break-all font-bold text-slate-900">
                    {order.orderNumber}
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    {order.branch?.name || "Branch unavailable"}
                  </p>
                </div>

                {order.refund ? (
                  <Badge status={order.refund.status} />
                ) : (
                  <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                    Review required
                  </span>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Refund amount</p>

                  <p className="mt-1 text-lg font-extrabold text-slate-900">
                    {money(order.refund?.amount || order.total)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Payment status</p>

                  <p className="mt-1 text-sm font-bold capitalize text-slate-800">
                    {statusLabel(order.paymentStatus)}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-xs text-slate-500">
                <p>
                  <span className="font-semibold text-slate-700">
                    Order date:
                  </span>{" "}
                  {dateTime(order.createdAt)}
                </p>

                {order.refund?.createdAt && (
                  <p>
                    <span className="font-semibold text-slate-700">
                      Refund requested:
                    </span>{" "}
                    {dateTime(order.refund.createdAt)}
                  </p>
                )}

                {order.refund?.reason && (
                  <p className="rounded-lg bg-slate-50 p-3 leading-5">
                    <span className="font-semibold text-slate-700">
                      Reason:
                    </span>{" "}
                    {order.refund.reason}
                  </p>
                )}

                {order.refund?.razorpayRefundId && (
                  <p className="break-all">
                    <span className="font-semibold text-slate-700">
                      Provider reference:
                    </span>{" "}
                    {order.refund.razorpayRefundId}
                  </p>
                )}
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                {!order.refund ? (
                  <button
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => onRequest(order)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {busyId === order.id ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : (
                      <RotateCcw size={16} />
                    )}
                    Request refund
                  </button>
                ) : ["pending", "unknown", "requested"].includes(
                    order.refund.status,
                  ) ? (
                  <button
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => onReconcile(order)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {busyId === order.id ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    Sync refund status
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <CheckCircle2 size={16} />
                    Refund status recorded
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={RotateCcw}
          title="No refunds to review"
          message="Cancelled or rejected paid orders that require refund review will appear here."
        />
      )}

      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
        Full and partial refunds use the existing Razorpay refund workflow.
        The restaurant payable ledger receives a matching commission adjustment.
      </div>

      <Pager pagination={data?.pagination} page={page} setPage={setPage} />
    </div>
  );
}
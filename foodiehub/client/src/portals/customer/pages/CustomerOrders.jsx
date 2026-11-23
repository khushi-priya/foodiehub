// import { useEffect, useState } from "react";
// import { Link } from "react-router-dom";
// import { api } from "../../../services/api";

// const money = (v) => `₹${Number(v || 0).toFixed(2)}`;
// const err = (e) => e.response?.data?.message || "Unable to load your orders.";
// export default function CustomerOrders() {
//   const [orders, setOrders] = useState([]),
//     [status, setStatus] = useState(""),
//     [error, setError] = useState(""),
//     [loading, setLoading] = useState(true);
//   useEffect(() => {
//     let active = true;
//     setLoading(true);
//     api
//       .get("/customer/orders", { params: status ? { status } : {} })
//       .then((r) => {
//         if (active) setOrders(r.data.data.orders || []);
//       })
//       .catch((e) => {
//         if (active) setError(err(e));
//       })
//       .finally(() => {
//         if (active) setLoading(false);
//       });
//     return () => {
//       active = false;
//     };
//   }, [status]);
//   return (
//     <div className="space-y-5">
//       <header className="flex flex-wrap items-end justify-between gap-3">
//         <div>
//           <h1 className="text-2xl font-extrabold">My Orders</h1>
//           <p className="mt-1 text-sm text-slate-500">
//             Orders placed from your FoodieHub account.
//           </p>
//         </div>
//         <select
//           aria-label="Filter orders"
//           value={status}
//           onChange={(e) => setStatus(e.target.value)}
//           className="rounded-xl border bg-white px-3 py-2.5 text-sm"
//         >
//           <option value="">All orders</option>
//           {[
//             "pending",
//             "accepted",
//             "preparing",
//             "ready",
//             "completed",
//             "cancelled",
//             "rejected",
//           ].map((s) => (
//             <option key={s} value={s}>
//               {s}
//             </option>
//           ))}
//         </select>
//       </header>
//       {error && (
//         <p
//           role="alert"
//           className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
//         >
//           {error}
//         </p>
//       )}
//       {loading ? (
//         <p className="py-12 text-center text-sm text-slate-500">
//           Loading orders…
//         </p>
//       ) : orders.length ? (
//         <div className="space-y-3">
//           {orders.map((o) => (
//             <article key={o.id} className="rounded-2xl border bg-white p-5">
//               <div className="flex flex-wrap items-center justify-between gap-4">
//                 <div>
//                   <h2 className="font-bold">
//                     {o.restaurant?.name || "Restaurant"} · #{o.orderNumber}
//                   </h2>
//                   <p className="mt-1 text-xs text-slate-500">
//                     {new Date(o.createdAt).toLocaleString()} ·{" "}
//                     {o.branch?.name || "Branch"} ·{" "}
//                     {String(o.orderType || "delivery").replace("_", " ")}
//                     {o.table?.tableNumber ? ` · Table ${o.table.tableNumber}` : ""}
//                   </p>
//                   <p className="mt-1 text-xs capitalize text-slate-500">
//                     Order: {o.status} · Payment: {o.paymentStatus} (
//                     {o.paymentMethod?.replaceAll("_", " ") || "not set"})
//                   </p>
//                 </div>
//                 <div className="text-right">
//                   <p className="font-bold">{money(o.total)}</p>
//                   <Link
//                     to={`/customer/orders/${o.id}`}
//                     className="mt-1 inline-block text-sm font-semibold text-orange-600"
//                   >
//                     View details
//                   </Link>
//                 </div>
//               </div>
//             </article>
//           ))}
//         </div>
//       ) : (
//         <div className="rounded-2xl border bg-white p-10 text-center">
//           <h2 className="font-bold">No orders found</h2>
//           <p className="mt-1 text-sm text-slate-500">
//             Your completed orders and active orders will appear here.
//           </p>
//           <Link
//             to="/restaurants"
//             className="mt-4 inline-block font-semibold text-orange-600"
//           >
//             Browse restaurants
//           </Link>
//         </div>
//       )}
//     </div>
//   );
// }



import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../services/api";

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const getError = (error) =>
  error.response?.data?.message || "Unable to load your orders.";

const statusStyles = {
  pending: "bg-amber-50 text-amber-700",
  accepted: "bg-blue-50 text-blue-700",
  preparing: "bg-orange-50 text-orange-700",
  ready: "bg-emerald-50 text-emerald-700",
  out_for_delivery: "bg-orange-50 text-orange-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-slate-100 text-slate-600",
  rejected: "bg-red-50 text-red-700",
};

const paymentStyles = {
  paid: "text-emerald-700",
  pending: "text-amber-700",
  failed: "text-red-600",
  refunded: "text-blue-700",
};

const filters = [
  { label: "All orders", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Accepted", value: "accepted" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready" },
  { label: "On the way", value: "out_for_delivery" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Rejected", value: "rejected" },
];

const formatLabel = (value) =>
  String(value || "Not set")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDate = (value) => {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function StatusBadge({ status }) {
  const value = String(status || "pending").toLowerCase();

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
        statusStyles[value] || "bg-slate-100 text-slate-600"
      }`}
    >
      {formatLabel(value)}
    </span>
  );
}

function OrderRow({ order }) {
  const paymentStatus = String(order.paymentStatus || "pending").toLowerCase();

  const orderType = String(order.orderType || "delivery").replaceAll("_", " ");

  return (
    <article className="group py-6 first:pt-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold tracking-tight text-slate-900">
              {order.restaurant?.name || "Restaurant"}
            </h2>

            <span className="text-slate-300">/</span>

            <span className="text-sm font-medium text-slate-500">
              #{order.orderNumber}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
            <span>{formatDate(order.createdAt)}</span>
            <span className="text-slate-300">·</span>
            <span>{order.branch?.name || "Branch"}</span>
            <span className="text-slate-300">·</span>
            <span className="capitalize">{orderType}</span>

            {order.table?.tableNumber && (
              <>
                <span className="text-slate-300">·</span>
                <span>Table {order.table.tableNumber}</span>
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusBadge status={order.status} />

            <span className="text-xs text-slate-400">
              Payment
            </span>

            <span
              className={`text-xs font-semibold capitalize ${
                paymentStyles[paymentStatus] || "text-slate-600"
              }`}
            >
              {formatLabel(paymentStatus)}
            </span>

            <span className="text-xs text-slate-400">
              ({formatLabel(order.paymentMethod)})
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-5 sm:justify-end">
          <div className="sm:text-right">
            <p className="text-xs text-slate-400">Order total</p>
            <p className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">
              {money(order.total)}
            </p>
          </div>

          <Link
            to={`/customer/orders/${order.id}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          >
            View details
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function CustomerOrders() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    api
      .get("/customer/orders", {
        params: status ? { status } : {},
      })
      .then((response) => {
        if (active) {
          setOrders(response.data.data.orders || []);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(getError(requestError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [status]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 pb-10">
      {/* Page heading */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
            Your FoodieHub account
          </p>

          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            My Orders
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Track your orders and revisit your food experiences.
          </p>
        </div>

        <Link
          to="/restaurants"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-orange-600 transition hover:text-orange-700"
        >
          Explore restaurants
          <span aria-hidden="true">↗</span>
        </Link>
      </header>

      {/* Status filters */}
      <nav
        aria-label="Filter orders by status"
        className="-mx-1 flex gap-6 overflow-x-auto px-1 pb-2"
      >
        {filters.map((filter) => {
          const selected = status === filter.value;

          return (
            <button
              key={filter.value || "all"}
              type="button"
              onClick={() => setStatus(filter.value)}
              aria-pressed={selected}
              className={`shrink-0 border-b-2 pb-3 text-sm font-semibold transition ${
                selected
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </nav>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Orders */}
      <section aria-label="Your orders">
        {loading ? (
          <div className="py-20 text-center">
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-orange-600" />
            <p className="mt-4 text-sm text-slate-500">
              Loading your orders...
            </p>
          </div>
        ) : orders.length > 0 ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">
                {status ? `${formatLabel(status)} orders` : "All orders"}
              </p>

              <p className="text-xs text-slate-400">
                {orders.length} {orders.length === 1 ? "order" : "orders"}
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          </>
        ) : (
          <div className="py-20 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-3xl">
              🍽️
            </div>

            <h2 className="mt-5 text-xl font-bold text-slate-900">
              No orders found
            </h2>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
              {status
                ? `You don't have any ${status} orders right now. Try another filter or explore restaurants.`
                : "Your FoodieHub orders will appear here once you place your first order."}
            </p>

            <Link
              to="/restaurants"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-700"
            >
              Explore restaurants
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}


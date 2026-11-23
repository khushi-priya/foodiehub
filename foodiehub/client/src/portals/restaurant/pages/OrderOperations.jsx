
// import { useCallback, useEffect, useState } from "react";
// import {
//   Check,
//   Clock3,
//   LoaderCircle,
//   RefreshCw,
//   Utensils,
//   ChefHat,
//   CircleAlert,
//   Eye,
//   MapPin,
//   CreditCard,
//   Receipt,
//   Phone,
//   CalendarDays,
//   Package,
//   ChevronUp,
// } from "lucide-react";
// import { api } from "../../../services/api";
// import { getUserRoles, useAuth } from "../../../context/AuthContext";

// const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

// const quantity = (value) => `${Number(value || 0)} ×`;

// const age = (date) => {
//   if (!date) return "Time unavailable";

//   const timestamp = new Date(date).getTime();

//   if (Number.isNaN(timestamp)) return "Time unavailable";

//   const minutes = Math.max(
//     0,
//     Math.floor((Date.now() - timestamp) / 60000)
//   );

//   if (minutes < 1) return "Just now";
//   if (minutes < 60) return `${minutes}m ago`;

//   const hours = Math.floor(minutes / 60);
//   if (hours < 24) return `${hours}h ago`;

//   return `${Math.floor(hours / 24)}d ago`;
// };

// const formatDate = (date) => {
//   if (!date) return "Not available";

//   const parsed = new Date(date);

//   if (Number.isNaN(parsed.getTime())) return "Not available";

//   return parsed.toLocaleString("en-IN", {
//     day: "2-digit",
//     month: "short",
//     year: "numeric",
//     hour: "2-digit",
//     minute: "2-digit",
//   });
// };

// const formatLabel = (value) => {
//   if (!value) return "Not specified";

//   return String(value)
//     .replaceAll("_", " ")
//     .replace(/\b\w/g, (character) => character.toUpperCase());
// };

// const text = (error) =>
//   error.response?.data?.message ||
//   error.message ||
//   "Unable to load orders.";

// const statusStyles = {
//   pending: "bg-amber-50 text-amber-700",
//   accepted: "bg-blue-50 text-blue-700",
//   preparing: "bg-orange-50 text-orange-700",
//   ready: "bg-emerald-50 text-emerald-700",
//   completed: "bg-slate-100 text-slate-600",
//   rejected: "bg-rose-50 text-rose-700",
//   cancelled: "bg-rose-50 text-rose-700",
// };

// function StatusBadge({ status }) {
//   return (
//     <span
//       className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
//         statusStyles[status] ||
//         "bg-slate-100 text-slate-600"
//       }`}
//     >
//       {formatLabel(status || "unknown")}
//     </span>
//   );
// }

// function InfoCard({ icon: Icon, label, children }) {
//   return (
//     <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
//       <p className="flex items-center gap-2 text-xs text-slate-400">
//         <Icon size={14} />
//         {label}
//       </p>

//       <div className="mt-2 break-words text-sm text-slate-700">
//         {children}
//       </div>
//     </div>
//   );
// }

// function OrderDetailsInline({ order }) {
//   if (!order) return null;

//   const items = Array.isArray(order.items) ? order.items : [];

//   const branchName =
//     order.branch?.name ||
//     order.branchName ||
//     order.restaurantBranch?.name ||
//     "Branch not available";

//   return (
//     <div className="mt-4 border-t border-orange-100 bg-slate-50/70 p-3 sm:p-4">
//       <div className="mb-4 flex items-center justify-between gap-2">
//         <h4 className="text-sm font-medium text-slate-800">
//           Order details
//         </h4>

//         <span className="text-xs text-slate-400">
//           {formatDate(order.createdAt)}
//         </span>
//       </div>

//       <div className="grid grid-cols-2 gap-2 sm:gap-3">
//         <InfoCard icon={Phone} label="Customer">
//           <p>{order.customerName || "Customer"}</p>
//           {order.customerPhone && (
//             <p className="mt-1 text-xs text-slate-500">
//               {order.customerPhone}
//             </p>
//           )}
//         </InfoCard>

//         <InfoCard icon={Package} label="Order type">
//           <p>{formatLabel(order.orderType || "delivery")}</p>
//           {order.table?.tableNumber && (
//             <p className="mt-1 text-xs text-slate-500">
//               Table {order.table.tableNumber}
//             </p>
//           )}
//         </InfoCard>

//         <InfoCard icon={MapPin} label="Branch">
//           {branchName}
//         </InfoCard>

//         <InfoCard icon={CreditCard} label="Payment">
//           <p>{formatLabel(order.paymentMethod)}</p>
//           <p
//             className={`mt-1 text-xs ${
//               order.paymentStatus === "paid"
//                 ? "text-emerald-600"
//                 : "text-slate-500"
//             }`}
//           >
//             {formatLabel(order.paymentStatus)}
//           </p>
//         </InfoCard>
//       </div>

//       <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
//         <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
//           <h5 className="flex items-center gap-2 text-sm font-medium text-slate-800">
//             <Receipt size={16} className="text-orange-500" />
//             Ordered items
//           </h5>

//           <span className="text-xs text-slate-400">
//             {items.length} {items.length === 1 ? "item" : "items"}
//           </span>
//         </div>

//         {items.length ? (
//           <div className="divide-y divide-slate-100 px-3">
//             {items.map((item, index) => (
//               <div
//                 key={item.id || `${item.itemName}-${index}`}
//                 className="flex gap-3 py-3"
//               >
//                 {item.menuItem?.imageUrl ? (
//                   <img
//                     src={item.menuItem.imageUrl}
//                     alt={item.itemName || "Menu item"}
//                     className="h-12 w-12 shrink-0 rounded-lg object-cover"
//                     onError={(event) => {
//                       event.currentTarget.style.display = "none";
//                     }}
//                   />
//                 ) : (
//                   <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
//                     <Utensils size={19} />
//                   </div>
//                 )}

//                 <div className="min-w-0 flex-1">
//                   <p className="text-sm text-slate-800">
//                     {item.itemName || "Menu item"}
//                   </p>

//                   {item.variantName && (
//                     <p className="mt-0.5 text-xs text-slate-500">
//                       {item.variantName}
//                     </p>
//                   )}

//                   <p className="mt-1 text-xs text-slate-500">
//                     Quantity: {Number(item.quantity || 0)}
//                   </p>

//                   {Array.isArray(item.addonsSnapshot) &&
//                     item.addonsSnapshot.length > 0 && (
//                       <p className="mt-1 text-xs text-slate-500">
//                         Add-ons:{" "}
//                         {item.addonsSnapshot
//                           .map((addon) => addon.name)
//                           .filter(Boolean)
//                           .join(", ")}
//                       </p>
//                     )}

//                   {item.itemNotes && (
//                     <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
//                       Note: {item.itemNotes}
//                     </p>
//                   )}

//                   {item.unitPrice != null && (
//                     <p className="mt-1 text-xs text-slate-500">
//                       {money(item.unitPrice)} each
//                     </p>
//                   )}
//                 </div>

//                 <span className="shrink-0 text-sm tabular-nums text-slate-700">
//                   {money(item.lineTotal)}
//                 </span>
//               </div>
//             ))}
//           </div>
//         ) : (
//           <p className="p-4 text-sm text-slate-500">
//             No item details available.
//           </p>
//         )}

//         {order.customerNotes && (
//           <div className="border-t border-slate-100 p-3">
//             <p className="flex items-center gap-2 text-xs font-medium text-amber-800">
//               <CircleAlert size={14} />
//               Special instructions
//             </p>

//             <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600">
//               {order.customerNotes}
//             </p>
//           </div>
//         )}

//         <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-3">
//           <div>
//             <p className="text-xs text-slate-500">Order total</p>
//             <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
//               {money(order.total)}
//             </p>
//           </div>

//           <StatusBadge status={order.status} />
//         </div>
//       </div>
//     </div>
//   );
// }

// function Notice({ error, notice, onRetry }) {
//   return (
//     <>
//       {notice && (
//         <p
//           role="status"
//           className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700"
//         >
//           {notice}
//         </p>
//       )}

//       {error && (
//         <div
//           role="alert"
//           className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700"
//         >
//           <span>{error}</span>
//           <button
//             type="button"
//             onClick={onRetry}
//             className="shrink-0 font-medium underline"
//           >
//             Retry
//           </button>
//         </div>
//       )}
//     </>
//   );
// }

// function EmptyState({ icon: Icon, title, description }) {
//   return (
//     <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
//       <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
//         <Icon size={24} />
//       </span>

//       <h3 className="mt-3 text-sm font-medium text-slate-800">
//         {title}
//       </h3>

//       <p className="mt-1 text-xs text-slate-500">
//         {description}
//       </p>
//     </div>
//   );
// }

// export function KitchenDisplay() {
//   const { user } = useAuth();
//   const userRoles = getUserRoles(user);

//   const kitchenOnly =
//     userRoles.includes("kitchen_staff") &&
//     !userRoles.includes("restaurant_owner");

//   const [orders, setOrders] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [busy, setBusy] = useState("");
//   const [error, setError] = useState("");
//   const [notice, setNotice] = useState("");
//   const [expandedOrderId, setExpandedOrderId] = useState(null);

//   const load = useCallback(async () => {
//     setLoading(true);
//     setError("");

//     try {
//       const result = await api.get("/restaurant/orders", {
//         params: { limit: 100 },
//       });

//       setOrders(
//         Array.isArray(result.data?.data?.orders)
//           ? result.data.data.orders
//           : []
//       );
//     } catch (e) {
//       setError(text(e));
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     load();
//   }, [load]);

//   async function update(order, status) {
//     if (
//       status === "rejected" &&
//       !window.confirm(`Reject order #${order.orderNumber}?`)
//     ) {
//       return;
//     }

//     setBusy(order.id);
//     setError("");

//     try {
//       await api.patch(
//         `/restaurant/orders/${order.id}/status`,
//         { status }
//       );

//       setNotice(
//         `#${order.orderNumber} moved to ${formatLabel(status)}.`
//       );

//       setExpandedOrderId(null);
//       await load();

//       window.setTimeout(() => setNotice(""), 3000);
//     } catch (e) {
//       setError(text(e));
//     } finally {
//       setBusy("");
//     }
//   }

//   const lanes = [
//     {
//       title: "New tickets",
//       subtitle: "Orders awaiting preparation",
//       items: orders.filter((order) =>
//         ["pending", "accepted"].includes(order.status)
//       ),
//       action: (order) =>
//         order.status === "pending" ? "accepted" : "preparing",
//       empty: "No new tickets",
//       description: "New orders will appear here.",
//       icon: Receipt,
//     },
//     {
//       title: "Preparing",
//       subtitle: "Currently being prepared",
//       items: orders.filter((order) => order.status === "preparing"),
//       action: () => "ready",
//       empty: "Nothing on the line",
//       description: "Orders being prepared will appear here.",
//       icon: ChefHat,
//     },
//     {
//       title: "Ready for pickup",
//       subtitle: "Completed kitchen tickets",
//       items: orders.filter((order) => order.status === "ready"),
//       action: () => null,
//       empty: "No plates ready",
//       description: "Ready orders will appear here.",
//       icon: Check,
//     },
//   ];

//   return (
//     <main className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 pb-8">
//       {/* Header */}
//       <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
//         <div>
//           <p className="text-xs font-medium tracking-wide text-orange-600">
//             FoodieHub / Kitchen
//           </p>

//           <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-900">
//             <span className="rounded-xl bg-orange-50 p-2 text-orange-500">
//               <ChefHat size={23} />
//             </span>
//             Kitchen display
//           </h1>

//           <p className="mt-1 text-sm text-slate-500">
//             Manage incoming tickets and monitor kitchen preparation.
//           </p>
//         </div>

//         <button
//           type="button"
//           onClick={load}
//           disabled={loading}
//           className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 sm:self-auto"
//         >
//           <RefreshCw
//             size={15}
//             className={loading ? "animate-spin" : ""}
//           />
//           Refresh queue
//         </button>
//       </header>

//       <Notice error={error} notice={notice} onRetry={load} />

//       {/* Queue summary */}
//       <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
//         {[
//           {
//             label: "New tickets",
//             value: lanes[0].items.length,
//             color: "text-sky-700",
//             bg: "bg-sky-50",
//           },
//           {
//             label: "Preparing",
//             value: lanes[1].items.length,
//             color: "text-orange-700",
//             bg: "bg-orange-50",
//           },
//           {
//             label: "Ready",
//             value: lanes[2].items.length,
//             color: "text-emerald-700",
//             bg: "bg-emerald-50",
//           },
//         ].map((item) => (
//           <div
//             key={item.label}
//             className="rounded-xl border border-slate-200 bg-white p-4"
//           >
//             <div className="flex items-center justify-between">
//               <p className="text-sm text-slate-500">
//                 {item.label}
//               </p>

//               <span className={`rounded-lg p-2 ${item.bg} ${item.color}`}>
//                 <Utensils size={16} />
//               </span>
//             </div>

//             <p className={`mt-2 text-2xl font-semibold tabular-nums ${item.color}`}>
//               {loading ? "—" : item.value}
//             </p>
//           </div>
//         ))}
//       </div>

//       {/* Kitchen lanes */}
//       {loading ? (
//         <div className="grid gap-4 md:grid-cols-3">
//           {[1, 2, 3].map((number) => (
//             <div
//               key={number}
//               className="h-96 animate-pulse rounded-xl bg-slate-100"
//             />
//           ))}
//         </div>
//       ) : (
//         <div className="grid min-w-0 gap-4 md:grid-cols-3">
//           {lanes.map((lane) => (
//             <section
//               key={lane.title}
//               className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4"
//             >
//               <header className="mb-4 flex items-center justify-between gap-2">
//                 <div>
//                   <h2 className="text-sm font-semibold text-slate-800">
//                     {lane.title}
//                   </h2>
//                   <p className="mt-1 text-xs text-slate-500">
//                     {lane.subtitle}
//                   </p>
//                 </div>

//                 <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-white px-2 text-sm font-medium text-slate-600">
//                   {lane.items.length}
//                 </span>
//               </header>

//               <div className="space-y-3">
//                 {lane.items.map((order) => {
//                   const nextStatus = lane.action(order);

//                   const unpaidRazorpay =
//                     order.status === "pending" &&
//                     order.paymentMethod === "razorpay" &&
//                     order.paymentStatus !== "paid";

//                   const disabled =
//                     busy === order.id ||
//                     (kitchenOnly && order.status === "pending") ||
//                     unpaidRazorpay;

//                   const expanded = expandedOrderId === order.id;
//                   const items = Array.isArray(order.items)
//                     ? order.items
//                     : [];

//                   return (
//                     <article
//                       key={order.id}
//                       className={`overflow-hidden rounded-xl border bg-white transition ${
//                         expanded
//                           ? "border-orange-200"
//                           : "border-slate-200 hover:border-slate-300"
//                       }`}
//                     >
//                       <div className="p-4">
//                         <div className="flex items-start justify-between gap-2">
//                           <div className="min-w-0">
//                             <p className="text-xs text-slate-400">
//                               Order ticket
//                             </p>

//                             <h3 className="mt-1 break-all text-lg font-semibold tabular-nums text-slate-900">
//                               #{order.orderNumber}
//                             </h3>
//                           </div>

//                           <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-xs text-slate-600">
//                             <Clock3 size={13} />
//                             {age(order.createdAt)}
//                           </span>
//                         </div>

//                         <div className="mt-3 flex flex-wrap gap-2">
//                           <StatusBadge status={order.status} />

//                           <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
//                             {formatLabel(order.orderType || "delivery")}
//                           </span>

//                           {order.table?.tableNumber && (
//                             <span className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs text-orange-700">
//                               Table {order.table.tableNumber}
//                             </span>
//                           )}
//                         </div>

//                         <div className="mt-4 space-y-3 border-y border-slate-100 py-3">
//                           {items.map((item, index) => (
//                             <div
//                               key={item.id || `${item.itemName}-${index}`}
//                               className="flex items-center gap-3"
//                             >
//                               <span className="flex h-8 min-w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 px-2 text-xs tabular-nums text-slate-700">
//                                 {quantity(item.quantity)}
//                               </span>

//                               {item.menuItem?.imageUrl && (
//                                 <img
//                                   src={item.menuItem.imageUrl}
//                                   alt=""
//                                   className="h-9 w-9 shrink-0 rounded-lg object-cover"
//                                   onError={(event) => {
//                                     event.currentTarget.style.display = "none";
//                                   }}
//                                 />
//                               )}

//                               <div className="min-w-0 flex-1">
//                                 <p className="truncate text-sm text-slate-800">
//                                   {item.itemName || "Menu item"}
//                                 </p>

//                                 {item.variantName && (
//                                   <p className="mt-0.5 truncate text-xs text-slate-500">
//                                     {item.variantName}
//                                   </p>
//                                 )}

//                                 {item.addonsSnapshot?.length > 0 && (
//                                   <p className="mt-0.5 truncate text-xs text-slate-500">
//                                     +{" "}
//                                     {item.addonsSnapshot
//                                       .map((addon) => addon.name)
//                                       .filter(Boolean)
//                                       .join(", ")}
//                                   </p>
//                                 )}
//                               </div>
//                             </div>
//                           ))}

//                           {items.length === 0 && (
//                             <p className="text-xs text-slate-400">
//                               No item details available.
//                             </p>
//                           )}
//                         </div>

//                         <div className="mt-3 flex items-center justify-between gap-2">
//                           <div className="min-w-0">
//                             <p className="truncate text-sm text-slate-700">
//                               {order.customerName || "Customer"}
//                             </p>
//                             <p className="mt-0.5 text-xs text-slate-500">
//                               Order total
//                             </p>
//                           </div>

//                           <p className="whitespace-nowrap text-base font-semibold tabular-nums text-slate-900">
//                             {money(order.total)}
//                           </p>
//                         </div>

//                         <button
//                           type="button"
//                           onClick={() =>
//                             setExpandedOrderId((current) =>
//                               current === order.id ? null : order.id
//                             )
//                           }
//                           aria-expanded={expanded}
//                           className={`mt-4 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
//                             expanded
//                               ? "bg-orange-50 text-orange-700"
//                               : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
//                           }`}
//                         >
//                           <Eye size={15} />
//                           {expanded ? "Hide details" : "View details"}
//                           {expanded && <ChevronUp size={15} />}
//                         </button>

//                         {nextStatus && (
//                           <button
//                             type="button"
//                             disabled={disabled}
//                             onClick={() => update(order, nextStatus)}
//                             className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
//                           >
//                             {busy === order.id ? (
//                               <LoaderCircle
//                                 className="animate-spin"
//                                 size={16}
//                               />
//                             ) : (
//                               <Check size={16} />
//                             )}

//                             {busy === order.id
//                               ? "Updating..."
//                               : kitchenOnly && order.status === "pending"
//                                 ? "Awaiting restaurant acceptance"
//                                 : unpaidRazorpay
//                                   ? "Awaiting verified payment"
//                                   : nextStatus === "accepted"
//                                     ? "Accept ticket"
//                                     : nextStatus === "preparing"
//                                       ? "Start preparation"
//                                       : "Mark ready"}
//                           </button>
//                         )}
//                       </div>

//                       {expanded && (
//                         <OrderDetailsInline order={order} />
//                       )}
//                     </article>
//                   );
//                 })}

//                 {lane.items.length === 0 && (
//                   <EmptyState
//                     icon={lane.icon}
//                     title={error ? "Queue unavailable" : lane.empty}
//                     description={lane.description}
//                   />
//                 )}
//               </div>
//             </section>
//           ))}
//         </div>
//       )}
//     </main>
//   );
// }

// export function WaiterOperations() {
//   const [orders, setOrders] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [busy, setBusy] = useState("");
//   const [error, setError] = useState("");
//   const [notice, setNotice] = useState("");
//   const [expandedOrderId, setExpandedOrderId] = useState(null);

//   const load = useCallback(async () => {
//     setLoading(true);
//     setError("");

//     try {
//       const result = await api.get("/restaurant/orders", {
//         params: { limit: 100 },
//       });

//       setOrders(
//         (Array.isArray(result.data?.data?.orders)
//           ? result.data.data.orders
//           : []
//         ).filter(
//           (order) =>
//             order.orderType === "dine_in" &&
//             !["rejected", "cancelled"].includes(order.status)
//         )
//       );
//     } catch (e) {
//       setError(text(e));
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   useEffect(() => {
//     load();
//   }, [load]);

//   async function serve(order) {
//     setBusy(order.id);
//     setError("");

//     try {
//       await api.patch(
//         `/restaurant/orders/${order.id}/status`,
//         { status: "completed" }
//       );

//       setNotice(`Order #${order.orderNumber} served.`);
//       setExpandedOrderId(null);

//       await load();

//       window.setTimeout(() => setNotice(""), 3000);
//     } catch (e) {
//       setError(text(e));
//     } finally {
//       setBusy("");
//     }
//   }

//   return (
//     <main className="mx-auto w-full min-w-0 max-w-[1400px] space-y-5 pb-8">
//       {/* Header */}
//       <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
//         <div>
//           <p className="text-xs font-medium tracking-wide text-orange-600">
//             FoodieHub / Floor operations
//           </p>

//           <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-900">
//             <span className="rounded-xl bg-orange-50 p-2 text-orange-500">
//               <Utensils size={23} />
//             </span>
//             Waiter service
//           </h1>

//           <p className="mt-1 text-sm text-slate-500">
//             Monitor dine-in orders and mark tables as served.
//           </p>
//         </div>

//         <button
//           type="button"
//           onClick={load}
//           disabled={loading}
//           className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 sm:self-auto"
//         >
//           <RefreshCw
//             size={15}
//             className={loading ? "animate-spin" : ""}
//           />
//           Refresh
//         </button>
//       </header>

//       <Notice error={error} notice={notice} onRetry={load} />

//       {loading ? (
//         <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
//           {[1, 2, 3].map((number) => (
//             <div
//               key={number}
//               className="h-72 animate-pulse rounded-xl bg-slate-100"
//             />
//           ))}
//         </div>
//       ) : orders.length ? (
//         <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
//           {orders.map((order) => {
//             const ready = order.status === "ready";

//             const serviceStatus =
//               order.status === "pending"
//                 ? "Order received"
//                 : order.status === "accepted"
//                   ? "Confirmed"
//                   : order.status === "preparing"
//                     ? "Being prepared"
//                     : ready
//                       ? "Ready to serve"
//                       : "Served";

//             const expanded = expandedOrderId === order.id;

//             return (
//               <article
//                 key={order.id}
//                 className={`min-w-0 overflow-hidden rounded-xl border bg-white transition ${
//                   expanded
//                     ? "border-orange-200"
//                     : ready
//                       ? "border-emerald-200"
//                       : "border-slate-200"
//                 }`}
//               >
//                 <div className="p-4">
//                   <div className="flex items-start justify-between gap-3">
//                     <div className="min-w-0">
//                       <p className="text-xs text-slate-400">
//                         Dine-in order
//                       </p>

//                       <h2 className="mt-1 text-xl font-semibold text-slate-900">
//                         {order.table?.tableNumber
//                           ? `Table ${order.table.tableNumber}`
//                           : "Table not assigned"}
//                       </h2>

//                       <p className="mt-1 break-all text-sm text-slate-500">
//                         #{order.orderNumber}
//                       </p>
//                     </div>

//                     <StatusBadge status={order.status} />
//                   </div>

//                   <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 p-3">
//                     <span className="text-sm text-slate-500">
//                       Order value
//                     </span>

//                     <span className="text-base font-semibold tabular-nums text-slate-900">
//                       {money(order.total)}
//                     </span>
//                   </div>

//                   <div className="mt-4 space-y-3 border-y border-slate-100 py-3">
//                     {(Array.isArray(order.items) ? order.items : []).map(
//                       (item, index) => (
//                         <div
//                           key={item.id || `${item.itemName}-${index}`}
//                           className="flex items-center gap-3"
//                         >
//                           <span className="flex h-8 min-w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 px-2 text-xs tabular-nums text-slate-700">
//                             {quantity(item.quantity)}
//                           </span>

//                           <span className="min-w-0 flex-1 text-sm text-slate-700">
//                             {item.itemName || "Menu item"}
//                           </span>
//                         </div>
//                       )
//                     )}
//                   </div>

//                   <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
//                     <span className="truncate">
//                       {order.customerName || "Customer"}
//                     </span>

//                     <span className="inline-flex shrink-0 items-center gap-1">
//                       <Clock3 size={13} />
//                       {age(order.createdAt)}
//                     </span>
//                   </div>

//                   <p className="mt-3 text-xs text-slate-500">
//                     Service status:{" "}
//                     <span className="text-slate-700">
//                       {serviceStatus}
//                     </span>
//                   </p>

//                   <button
//                     type="button"
//                     onClick={() =>
//                       setExpandedOrderId((current) =>
//                         current === order.id ? null : order.id
//                       )
//                     }
//                     aria-expanded={expanded}
//                     className={`mt-4 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
//                       expanded
//                         ? "bg-orange-50 text-orange-700"
//                         : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
//                     }`}
//                   >
//                     <Eye size={15} />
//                     {expanded ? "Hide details" : "View details"}
//                     {expanded && <ChevronUp size={15} />}
//                   </button>

//                   {ready && (
//                     <button
//                       type="button"
//                       disabled={busy === order.id}
//                       onClick={() => serve(order)}
//                       className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
//                     >
//                       {busy === order.id ? (
//                         <LoaderCircle
//                           size={16}
//                           className="animate-spin"
//                         />
//                       ) : (
//                         <Check size={16} />
//                       )}

//                       {busy === order.id ? "Updating..." : "Mark served"}
//                     </button>
//                   )}
//                 </div>

//                 {expanded && (
//                   <OrderDetailsInline order={order} />
//                 )}
//               </article>
//             );
//           })}
//         </div>
//       ) : (
//         <EmptyState
//           icon={Utensils}
//           title={error ? "Orders unavailable" : "No dine-in orders to serve"}
//           description={
//             error
//               ? "Retry to reload service orders."
//               : "Dine-in orders will appear here as they come in."
//           }
//         />
//       )}
//     </main>
//   );
// }


import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Utensils,
  ChefHat,
  CircleAlert,
  Eye,
  MapPin,
  CreditCard,
  Receipt,
  Phone,
  Package,
  ChevronUp,
} from "lucide-react";
import { api } from "../../../services/api";
import { connectFloorSocket } from "../../../services/socket";
import { getUserRoles, useAuth } from "../../../context/AuthContext";

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const quantity = (value) => `${Number(value || 0)} ×`;

const age = (date) => {
  if (!date) return "Time unavailable";

  const timestamp = new Date(date).getTime();

  if (Number.isNaN(timestamp)) return "Time unavailable";

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60000)
  );

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
};

const formatDate = (date) => {
  if (!date) return "Not available";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "Not available";

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatLabel = (value) => {
  if (!value) return "Not specified";

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const text = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Unable to load orders.";

const statusStyles = {
  pending: "bg-amber-50 text-amber-700",
  accepted: "bg-blue-50 text-blue-700",
  preparing: "bg-orange-50 text-orange-700",
  ready: "bg-emerald-50 text-emerald-700",
  completed: "bg-slate-100 text-slate-600",
  rejected: "bg-rose-50 text-rose-700",
  cancelled: "bg-rose-50 text-rose-700",
};

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        statusStyles[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {formatLabel(status || "unknown")}
    </span>
  );
}

function InfoCard({ icon: Icon, label, children }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-2 text-xs font-medium text-slate-400">
        <Icon size={14} />
        {label}
      </p>

      <div className="mt-2 break-words text-sm font-medium text-slate-700">
        {children}
      </div>
    </div>
  );
}

function OrderDetailsInline({ order }) {
  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];

  const branchName =
    order.branch?.name ||
    order.branchName ||
    order.restaurantBranch?.name ||
    "Branch not available";

  return (
    <div className="mt-4 border-t border-orange-100 bg-slate-50/70 p-3 sm:p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-800">
          Order details
        </h4>

        <span className="text-xs font-medium text-slate-400">
          {formatDate(order.createdAt)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <InfoCard icon={Phone} label="Customer">
          <p className="font-semibold">
            {order.customerName || "Customer"}
          </p>
          {order.customerPhone && (
            <p className="mt-1 text-xs font-normal text-slate-500">
              {order.customerPhone}
            </p>
          )}
        </InfoCard>

        <InfoCard icon={Package} label="Order type">
          <p>{formatLabel(order.orderType || "delivery")}</p>
          {order.table?.tableNumber && (
            <p className="mt-1 text-xs font-normal text-slate-500">
              Table {order.table.tableNumber}
            </p>
          )}
        </InfoCard>

        <InfoCard icon={MapPin} label="Branch">
          {branchName}
        </InfoCard>

        <InfoCard icon={CreditCard} label="Payment">
          <p>{formatLabel(order.paymentMethod)}</p>
          <p
            className={`mt-1 text-xs font-normal ${
              order.paymentStatus === "paid"
                ? "text-emerald-600"
                : "text-slate-500"
            }`}
          >
            {formatLabel(order.paymentStatus)}
          </p>
        </InfoCard>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
          <h5 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Receipt size={16} className="text-orange-500" />
            Ordered items
          </h5>

          <span className="text-xs font-medium text-slate-400">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
        </div>

        {items.length ? (
          <div className="divide-y divide-slate-100 px-3">
            {items.map((item, index) => (
              <div
                key={item.id || `${item.itemName}-${index}`}
                className="flex gap-3 py-3"
              >
                {item.menuItem?.imageUrl ? (
                  <img
                    src={item.menuItem.imageUrl}
                    alt={item.itemName || "Menu item"}
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                    <Utensils size={19} />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    {item.itemName || "Menu item"}
                  </p>

                  {item.variantName && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.variantName}
                    </p>
                  )}

                  <p className="mt-1 text-xs text-slate-500">
                    Quantity: {Number(item.quantity || 0)}
                  </p>

                  {Array.isArray(item.addonsSnapshot) &&
                    item.addonsSnapshot.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        Add-ons:{" "}
                        {item.addonsSnapshot
                          .map((addon) => addon.name)
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}

                  {item.itemNotes && (
                    <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                      Note: {item.itemNotes}
                    </p>
                  )}

                  {item.unitPrice != null && (
                    <p className="mt-1 text-xs text-slate-500">
                      {money(item.unitPrice)} each
                    </p>
                  )}
                </div>

                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
                  {money(item.lineTotal)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-500">
            No item details available.
          </p>
        )}

        {order.customerNotes && (
          <div className="border-t border-slate-100 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-amber-800">
              <CircleAlert size={14} />
              Special instructions
            </p>

            <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600">
              {order.customerNotes}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-3">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Order total
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">
              {money(order.total)}
            </p>
          </div>

          <StatusBadge status={order.status} />
        </div>
      </div>
    </div>
  );
}

function Notice({ error, notice, onRetry }) {
  return (
    <>
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {notice}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 font-medium underline"
          >
            Retry
          </button>
        </div>
      )}
    </>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
        <Icon size={24} />
      </span>

      <h3 className="mt-3 text-sm font-semibold text-slate-800">
        {title}
      </h3>

      <p className="mt-1 text-xs text-slate-500">
        {description}
      </p>
    </div>
  );
}

export function KitchenDisplay() {
  const { user } = useAuth();
  const userRoles = getUserRoles(user);

  const kitchenOnly =
    userRoles.includes("kitchen_staff") &&
    !userRoles.includes("restaurant_owner");

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await api.get("/restaurant/orders", {
        params: { limit: 100 },
      });

      setOrders(
        Array.isArray(result.data?.data?.orders)
          ? result.data.data.orders
          : []
      );
    } catch (e) {
      setError(text(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => connectFloorSocket(() => load()), [load]);

  async function update(order, status) {
    if (
      status === "rejected" &&
      !window.confirm(`Reject order #${order.orderNumber}?`)
    ) {
      return;
    }

    setBusy(order.id);
    setError("");

    try {
      await api.patch(
        `/restaurant/orders/${order.id}/status`,
        { status }
      );

      setNotice(
        `#${order.orderNumber} moved to ${formatLabel(status)}.`
      );

      setExpandedOrderId(null);
      await load();

      window.setTimeout(() => setNotice(""), 3000);
    } catch (e) {
      setError(text(e));
    } finally {
      setBusy("");
    }
  }

  async function confirmHandover(order) {
    if (!window.confirm(`Confirm packed food handover to the associate assigned to #${order.orderNumber}?`)) return;
    setBusy(order.id); setError("");
    try {
      await api.patch(`/restaurant/orders/${order.id}/kitchen-handover`, {});
      setNotice(`#${order.orderNumber} has been handed over to the delivery associate.`);
      await load();
      window.setTimeout(() => setNotice(""), 3000);
    } catch (e) { setError(text(e)); }
    finally { setBusy(""); }
  }

  const lanes = [
    {
      title: "New tickets",
      subtitle: "Orders awaiting preparation",
      items: orders.filter((order) =>
        ["pending", "accepted"].includes(order.status)
      ),
      action: (order) =>
        order.status === "pending" ? "accepted" : "preparing",
      empty: "No new tickets",
      description: "New orders will appear here.",
      icon: Receipt,
    },
    {
      title: "Preparing",
      subtitle: "Currently being prepared",
      items: orders.filter((order) => order.status === "preparing"),
      action: () => "ready",
      empty: "Nothing on the line",
      description: "Orders being prepared will appear here.",
      icon: ChefHat,
    },
    {
      title: "Ready for pickup",
      subtitle: "Completed kitchen tickets",
      items: orders.filter((order) => order.status === "ready"),
      action: () => null,
      empty: "No plates ready",
      description: "Ready orders will appear here.",
      icon: Check,
    },
  ];

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1600px] space-y-5 pb-8">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium tracking-wide text-orange-600">
            FoodieHub / Kitchen
          </p>

          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            <span className="rounded-xl bg-orange-50 p-2 text-orange-500">
              <ChefHat size={23} />
            </span>
            Kitchen display
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Manage incoming tickets and monitor kitchen preparation.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 sm:self-auto"
        >
          <RefreshCw
            size={15}
            className={loading ? "animate-spin" : ""}
          />
          Refresh queue
        </button>
      </header>

      <Notice error={error} notice={notice} onRetry={load} />

      {/* Queue summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: "New tickets",
            value: lanes[0].items.length,
            color: "text-sky-700",
            bg: "bg-sky-50",
          },
          {
            label: "Preparing",
            value: lanes[1].items.length,
            color: "text-orange-700",
            bg: "bg-orange-50",
          },
          {
            label: "Ready",
            value: lanes[2].items.length,
            color: "text-emerald-700",
            bg: "bg-emerald-50",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">
                {item.label}
              </p>

              <span className={`rounded-lg p-2 ${item.bg} ${item.color}`}>
                <Utensils size={16} />
              </span>
            </div>

            <p className={`mt-2 text-2xl font-bold tabular-nums ${item.color}`}>
              {loading ? "—" : item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Kitchen lanes */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((number) => (
            <div
              key={number}
              className="h-96 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 md:grid-cols-3">
          {lanes.map((lane) => (
            <section
              key={lane.title}
              className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4"
            >
              <header className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    {lane.title}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {lane.subtitle}
                  </p>
                </div>

                <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-white px-2 text-sm font-semibold text-slate-600">
                  {lane.items.length}
                </span>
              </header>

              <div className="space-y-3">
                {lane.items.map((order) => {
                  const nextStatus = lane.action(order);

                  const unpaidRazorpay =
                    order.status === "pending" &&
                    order.paymentMethod === "razorpay" &&
                    order.paymentStatus !== "paid";

                  const disabled =
                    busy === order.id ||
                    (kitchenOnly && order.status === "pending") ||
                    unpaidRazorpay;

                  const expanded = expandedOrderId === order.id;
                  const items = Array.isArray(order.items)
                    ? order.items
                    : [];

                  return (
                    <article
                      key={order.id}
                      className={`overflow-hidden rounded-xl border bg-white transition ${
                        expanded
                          ? "border-orange-200"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-400">
                              Order ticket
                            </p>

                            <h3 className="mt-1 break-all text-lg font-bold tabular-nums text-slate-900">
                              #{order.orderNumber}
                            </h3>
                          </div>

                          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-600">
                            <Clock3 size={13} />
                            {age(order.createdAt)}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <StatusBadge status={order.status} />

                          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                            {formatLabel(order.orderType || "delivery")}
                          </span>

                          {order.table?.tableNumber && (
                            <span className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
                              Table {order.table.tableNumber}
                            </span>
                          )}
                        </div>

                        <div className="mt-4 space-y-3 border-y border-slate-100 py-3">
                          {items.map((item, index) => (
                            <div
                              key={item.id || `${item.itemName}-${index}`}
                              className="flex items-center gap-3"
                            >
                              <span className="flex h-8 min-w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 px-2 text-xs font-medium tabular-nums text-slate-700">
                                {quantity(item.quantity)}
                              </span>

                              {item.menuItem?.imageUrl && (
                                <img
                                  src={item.menuItem.imageUrl}
                                  alt=""
                                  className="h-9 w-9 shrink-0 rounded-lg object-cover"
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                  }}
                                />
                              )}

                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-800">
                                  {item.itemName || "Menu item"}
                                </p>

                                {item.variantName && (
                                  <p className="mt-0.5 truncate text-xs text-slate-500">
                                    {item.variantName}
                                  </p>
                                )}

                                {item.addonsSnapshot?.length > 0 && (
                                  <p className="mt-0.5 truncate text-xs text-slate-500">
                                    +{" "}
                                    {item.addonsSnapshot
                                      .map((addon) => addon.name)
                                      .filter(Boolean)
                                      .join(", ")}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}

                          {items.length === 0 && (
                            <p className="text-xs text-slate-400">
                              No item details available.
                            </p>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-700">
                              {order.customerName || "Customer"}
                            </p>
                            <p className="mt-0.5 text-xs font-medium text-slate-500">
                              Order total
                            </p>
                          </div>

                          <p className="whitespace-nowrap text-base font-bold tabular-nums text-slate-900">
                            {money(order.total)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedOrderId((current) =>
                              current === order.id ? null : order.id
                            )
                          }
                          aria-expanded={expanded}
                          className={`mt-4 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
                            expanded
                              ? "bg-orange-50 text-orange-700"
                              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <Eye size={15} />
                          {expanded ? "Hide details" : "View details"}
                          {expanded && <ChevronUp size={15} />}
                        </button>

                        {nextStatus && (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => update(order, nextStatus)}
                            className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy === order.id ? (
                              <LoaderCircle
                                className="animate-spin"
                                size={16}
                              />
                            ) : (
                              <Check size={16} />
                            )}

                            {busy === order.id
                              ? "Updating..."
                              : kitchenOnly && order.status === "pending"
                                ? "Awaiting restaurant acceptance"
                                : unpaidRazorpay
                                  ? "Awaiting verified payment"
                                  : nextStatus === "accepted"
                                    ? "Accept ticket"
                                    : nextStatus === "preparing"
                                      ? "Start preparation"
                                      : "Mark ready"}
                          </button>
                        )}

                        {!kitchenOnly && order.orderType === "delivery" && order.status === "ready" && order.kitchenStatus === "ready" && order.deliveryAssignment?.status === "at_restaurant" && <button type="button" disabled={busy === order.id} onClick={() => confirmHandover(order)} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">{busy === order.id ? "Confirming…" : "Confirm packed food handover"}</button>}
                      </div>

                      {expanded && (
                        <OrderDetailsInline order={order} />
                      )}
                    </article>
                  );
                })}

                {lane.items.length === 0 && (
                  <EmptyState
                    icon={lane.icon}
                    title={error ? "Queue unavailable" : lane.empty}
                    description={lane.description}
                  />
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

export function WaiterOperations() {
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [result, tableResult] = await Promise.all([
        api.get("/restaurant/orders", { params: { limit: 100 } }),
        api.get("/restaurant/floor/tables"),
      ]);
      setTables(Array.isArray(tableResult.data?.data) ? tableResult.data.data : []);

      setOrders(
        (Array.isArray(result.data?.data?.orders)
          ? result.data.data.orders
          : []
        ).filter(
          (order) =>
            order.orderType === "dine_in" &&
            !["rejected", "cancelled"].includes(order.status)
        )
      );
    } catch (e) {
      setError(text(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => connectFloorSocket(() => load()), [load]);

  async function serve(order) {
    setBusy(order.id);
    setError("");

    try {
      await api.patch(
        `/restaurant/orders/${order.id}/status`,
        { status: "completed" }
      );

      setNotice(`Order #${order.orderNumber} served.`);
      setExpandedOrderId(null);

      await load();

      window.setTimeout(() => setNotice(""), 3000);
    } catch (e) {
      setError(text(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1400px] space-y-5 pb-8">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-medium tracking-wide text-orange-600">
            FoodieHub / Floor operations
          </p>

          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            <span className="rounded-xl bg-orange-50 p-2 text-orange-500">
              <Utensils size={23} />
            </span>
            Waiter service
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Monitor dine-in orders and mark tables as served.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 sm:self-auto"
        >
          <RefreshCw
            size={15}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </header>

      <Notice error={error} notice={notice} onRetry={load} />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">Your assigned tables</h2>
            <p className="mt-1 text-xs text-slate-500">Table status updates with reservations and dine-in orders.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{tables.length}</span>
        </div>
        {tables.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{tables.map((table) => <div key={table.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><p className="font-bold text-slate-900">Table {table.tableNumber}</p><span className={`rounded-full px-2 py-1 text-[10px] font-bold capitalize ${table.occupancyStatus === "occupied" ? "bg-orange-50 text-orange-700" : table.occupancyStatus === "reserved" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{String(table.occupancyStatus || "available").replaceAll("_", " ")}</span></div><p className="mt-1 text-xs text-slate-500">{table.branch?.name || "Branch"} · {table.orders?.length || 0} active orders</p></div>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No tables are assigned to your waiter account yet.</p>}
      </section>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((number) => (
            <div
              key={number}
              className="h-72 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      ) : orders.length ? (
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const ready = order.status === "ready";

            const serviceStatus =
              order.status === "pending"
                ? "Order received"
                : order.status === "accepted"
                  ? "Confirmed"
                  : order.status === "preparing"
                    ? "Being prepared"
                    : ready
                      ? "Ready to serve"
                      : "Served";

            const expanded = expandedOrderId === order.id;

            return (
              <article
                key={order.id}
                className={`min-w-0 overflow-hidden rounded-xl border bg-white transition ${
                  expanded
                    ? "border-orange-200"
                    : ready
                      ? "border-emerald-200"
                      : "border-slate-200"
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-400">
                        Dine-in order
                      </p>

                      <h2 className="mt-1 text-xl font-bold text-slate-900">
                        {order.table?.tableNumber
                          ? `Table ${order.table.tableNumber}`
                          : "Table not assigned"}
                      </h2>

                      <p className="mt-1 break-all text-sm font-medium text-slate-500">
                        #{order.orderNumber}
                      </p>
                    </div>

                    <StatusBadge status={order.status} />
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 p-3">
                    <span className="text-sm font-medium text-slate-500">
                      Order value
                    </span>

                    <span className="text-base font-bold tabular-nums text-slate-900">
                      {money(order.total)}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3 border-y border-slate-100 py-3">
                    {(Array.isArray(order.items) ? order.items : []).map(
                      (item, index) => (
                        <div
                          key={item.id || `${item.itemName}-${index}`}
                          className="flex items-center gap-3"
                        >
                          <span className="flex h-8 min-w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 px-2 text-xs font-medium tabular-nums text-slate-700">
                            {quantity(item.quantity)}
                          </span>

                          <span className="min-w-0 flex-1 text-sm font-semibold text-slate-700">
                            {item.itemName || "Menu item"}
                          </span>
                        </div>
                      )
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate font-semibold text-slate-700">
                      {order.customerName || "Customer"}
                    </span>

                    <span className="inline-flex shrink-0 items-center gap-1">
                      <Clock3 size={13} />
                      {age(order.createdAt)}
                    </span>
                  </div>

                  <p className="mt-3 text-xs font-medium text-slate-500">
                    Service status:{" "}
                    <span className="font-semibold text-slate-700">
                      {serviceStatus}
                    </span>
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedOrderId((current) =>
                        current === order.id ? null : order.id
                      )
                    }
                    aria-expanded={expanded}
                    className={`mt-4 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
                      expanded
                        ? "bg-orange-50 text-orange-700"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Eye size={15} />
                    {expanded ? "Hide details" : "View details"}
                    {expanded && <ChevronUp size={15} />}
                  </button>

                  {ready && (
                    <button
                      type="button"
                      disabled={busy === order.id}
                      onClick={() => serve(order)}
                      className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy === order.id ? (
                        <LoaderCircle
                          size={16}
                          className="animate-spin"
                        />
                      ) : (
                        <Check size={16} />
                      )}

                      {busy === order.id ? "Updating..." : "Mark served"}
                    </button>
                  )}
                </div>

                {expanded && (
                  <OrderDetailsInline order={order} />
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Utensils}
          title={error ? "Orders unavailable" : "No dine-in orders to serve"}
          description={
            error
              ? "Retry to reload service orders."
              : "Dine-in orders will appear here as they come in."
          }
        />
      )}
    </main>
  );
}

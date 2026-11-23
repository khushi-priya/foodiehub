
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  ShoppingBag,
  UtensilsCrossed,
  CreditCard,
  XCircle,
  LoaderCircle,
  PackageCheck,
  Phone,
  Truck,
  UserRound,
  Navigation,
} from "lucide-react";
import { api } from "../../../services/api";
import { connectCustomerDeliverySocket } from "../../../services/socket";

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const steps = [
  ["pending", "Order received"],
  ["accepted", "Restaurant confirmed"],
  ["preparing", "Preparing your food"],
  ["ready", "Ready for pickup / serving"],
  ["assigned", "Delivery partner assigned"],
  ["picked_up", "Partner picked up your order"],
  ["out_for_delivery", "On the way"],
  ["at_customer", "Partner reached you"],
  ["completed", "Delivered"],
];

const pretty = (value = "") =>
  String(value).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const formatTimestamp = (value) => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";

function addressValue(value) {
  if (!value) return null;

  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

function StatusBadge({ status }) {
  const terminal = ["rejected", "cancelled", "failed"].includes(status);
  const completed = status === "completed";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
        terminal
          ? "bg-rose-50 text-rose-700"
          : completed
            ? "bg-emerald-50 text-emerald-700"
            : "bg-orange-50 text-orange-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          terminal
            ? "bg-rose-500"
            : completed
              ? "bg-emerald-500"
              : "bg-orange-500"
        }`}
      />
      {pretty(status)}
    </span>
  );
}

function OrderProgress({ order }) {
  const tracking = order.deliveryTracking;
  const delivery = order.orderType === "delivery";
  const deliveryFailed = delivery && ["failed", "cancelled"].includes(tracking?.status);
  const terminal = ["rejected", "cancelled"].includes(order.status) || deliveryFailed;
  const progressSteps = delivery ? steps : steps.filter(([status]) => !["assigned", "picked_up", "out_for_delivery", "at_customer"].includes(status));
  const deliveryStage = {
    pending_acceptance: "assigned",
    accepted: "assigned",
    arriving_at_restaurant: "assigned",
    at_restaurant: "assigned",
    picked_up: "picked_up",
    on_the_way: "out_for_delivery",
    at_customer: "at_customer",
    delivered: "completed",
  }[tracking?.status];
  const currentStatus = order.status === "out_for_delivery" && delivery
    ? (deliveryStage || "picked_up")
    : order.status;
  const activeIndex = progressSteps.findIndex(([status]) => status === currentStatus);

  if (terminal) {
    return (
      <div className="mt-7 flex items-start gap-3 rounded-xl bg-rose-50 px-4 py-4">
        <XCircle className="mt-0.5 shrink-0 text-rose-600" size={21} />
        <div>
          <p className="font-semibold text-rose-900">
            {pretty(deliveryFailed ? tracking.status : order.status)}
          </p>
          <p className="mt-1 text-sm leading-6 text-rose-700">
            {deliveryFailed
              ? "The delivery could not be completed. Contact the restaurant for the next step; the order has not been marked delivered."
              : order.status === "rejected"
                ? "The restaurant could not accept this order. Please contact the restaurant if you need assistance."
                : "This order has been cancelled."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ol className="mt-9 grid grid-cols-1 gap-6 sm:grid-cols-[repeat(var(--step-count),minmax(0,1fr))] sm:gap-2" style={{ "--step-count": progressSteps.length }}>
      {progressSteps.map(([status, title], index) => {
        const assignmentStage = delivery && ["assigned", "picked_up", "out_for_delivery", "at_customer", "completed"].includes(status);
        const assignmentStatus = tracking?.status;
        const assignmentComplete = status === "assigned"
          ? Boolean(tracking?.assignedAt && !["rejected", "timed_out", "reassigned", "cancelled", "failed"].includes(assignmentStatus))
          : status === "picked_up"
            ? ["picked_up", "on_the_way", "at_customer", "delivered"].includes(assignmentStatus)
            : status === "out_for_delivery"
              ? ["on_the_way", "at_customer", "delivered"].includes(assignmentStatus)
              : status === "at_customer"
                ? ["at_customer", "delivered"].includes(assignmentStatus)
                : status === "completed" ? assignmentStatus === "delivered" : false;
        const orderComplete = !assignmentStage && index < activeIndex;
        const complete = assignmentComplete || orderComplete || (!delivery && status === "completed" && order.status === "completed");
        const active = index === activeIndex;

        return (
          <li
            key={status}
            className="relative flex gap-3 sm:block sm:text-center"
          >
            <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white sm:mx-auto">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  complete
                    ? "bg-emerald-600 text-white"
                    : active
                      ? "bg-orange-600 text-white ring-4 ring-orange-100"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {complete ? (
                  <Check size={16} />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-current" />
                )}
              </span>
            </div>

            <div className="sm:mt-3">
              <p
                className={`text-sm ${
                  active
                    ? "font-bold text-slate-900"
                    : complete
                      ? "font-semibold text-emerald-700"
                      : "font-medium text-slate-400"
                }`}
              >
                {title}
              </p>

              {active && (
                <span className="mt-1 block text-xs font-medium text-orange-600">
                  Current status
                </span>
              )}
            </div>

            {index < progressSteps.length - 1 && (
              <span
                className={`absolute left-[17px] top-9 h-[calc(100%+1.5rem)] w-0.5 sm:left-[calc(50%+25px)] sm:top-4 sm:h-0.5 sm:w-[calc(100%-50px)] ${
                  index < activeIndex ? "bg-emerald-500" : "bg-slate-200"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SummaryRow({ label, children, valueClassName = "" }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium text-slate-800 ${valueClassName}`}>
        {children}
      </span>
    </div>
  );
}

export default function CustomerOrderDetails() {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const justPlaced = location.state?.justPlaced === true;

  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [cancellationBusy, setCancellationBusy] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderMessage, setReorderMessage] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const r = await api.get(`/customer/orders/${orderId}`);
      setOrder(r.data.data);
    } catch (e) {
      setError(e.response?.data?.message || "Order not found.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) load(); });

    const timer = window.setInterval(() => {
      api
        .get(`/customer/orders/${orderId}`)
        .then((r) => setOrder(r.data.data))
        .catch(() => {});
    }, 20000);

    return () => { active = false; window.clearInterval(timer); };
  }, [load, orderId]);

  useEffect(() => connectCustomerDeliverySocket((event) => {
    if (event.orderId === orderId) load();
  }), [load, orderId]);

  async function retryPayment() {
    setPaymentBusy(true);
    setError("");

    try {
      const scriptReady =
        window.Razorpay ||
        (await new Promise((resolve) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.async = true;
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        }));

      if (!scriptReady || !window.Razorpay) {
        throw new Error(
          "Razorpay Checkout could not be loaded. Check your connection and try again."
        );
      }

      const response = await api.post(
        "/customer/checkout/razorpay/order",
        {
          idempotencyKey: order.idempotencyKey,
        }
      );

      const payment = response.data.data;

      const checkout = new window.Razorpay({
        key: payment.keyId,
        order_id: payment.razorpayOrderId,
        amount: payment.amount,
        currency: payment.currency,
        name: "FoodieHub",
        description: `Order ${payment.orderNumber}`,
        prefill: payment.customer,
        theme: { color: "#ea580c" },

        handler: async (result) => {
          try {
            await api.post(
              `/customer/orders/${order.id}/payments/razorpay/verify`,
              result
            );

            await load();
          } catch (err) {
            setError(
              err.response?.data?.message ||
                "Payment is not confirmed yet. Refresh or retry verification."
            );
          } finally {
            setPaymentBusy(false);
          }
        },

        modal: {
          ondismiss: () => setPaymentBusy(false),
        },
      });

      checkout.on("payment.failed", async (event) => {
        const failure = event.error?.metadata;

        if (failure?.payment_id && failure?.order_id) {
          await api
            .post(
              `/customer/orders/${order.id}/payments/razorpay/failure`,
              {
                paymentId: failure.payment_id,
                razorpayOrderId: failure.order_id,
              }
            )
            .catch(() => {});
        }

        setError(
          event.error?.description ||
            "Payment did not complete. Your order remains unpaid."
        );

        setPaymentBusy(false);
      });

      checkout.open();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to retry payment."
      );

      setPaymentBusy(false);
    }
  }

  async function cancelOrder() {
    if (!window.confirm("Cancel this order? The payment status will remain unchanged.")) return;
    setCancellationBusy(true);
    setError("");
    try {
      await api.patch(`/customer/orders/${order.id}/cancel`);
      await load();
    } catch (cancelError) {
      setError(cancelError.response?.data?.message || "This order could not be cancelled.");
    } finally {
      setCancellationBusy(false);
    }
  }

  async function reorder() {
    setReorderBusy(true);
    setReorderMessage("");
    try {
      await api.post(`/customer/orders/${order.id}/reorder`, { idempotencyKey: window.crypto.randomUUID() });
      navigate("/customer/cart", { state: { notice: "Previous order added to your cart." } });
    } catch (reorderError) {
      setReorderMessage(reorderError.response?.data?.message || "This order could not be added to your cart.");
    } finally {
      setReorderBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="animate-pulse space-y-8">
          <div className="h-5 w-32 rounded bg-slate-100" />
          <div className="h-36 rounded-xl bg-slate-100" />
          <div className="h-32 rounded-xl bg-slate-100" />
          <div className="h-64 rounded-xl bg-slate-100" />
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <XCircle size={40} className="mx-auto text-rose-500" />

        <h1 className="mt-5 text-2xl font-bold text-slate-900">
          We couldn't load this order
        </h1>

        {error && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={load}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <RefreshCw size={16} />
          Try again
        </button>

        <div>
          <Link
            to="/customer/orders"
            className="mt-5 inline-block text-sm font-semibold text-orange-600 hover:text-orange-700"
          >
            Back to my orders
          </Link>
        </div>
      </main>
    );
  }

  const address = addressValue(order.deliveryAddress);
  const terminal = ["rejected", "cancelled"].includes(order.status);
  const current = steps.find(([status]) => status === order.status);

  const paymentLabel =
    order.paymentStatus === "paid"
      ? "Paid"
      : pretty(order.paymentStatus || "Pending");

  const progressDescription = terminal
    ? order.status === "rejected"
      ? "The restaurant could not accept this order."
      : "This order was cancelled."
    : current?.[1] || "Order status updated";

  const taxAndFees =
    Number(order.tax || 0) +
    Number(order.packagingFee || 0) +
    Number(order.deliveryFee || 0);

  const isDineIn = order.orderType === "dine_in";

  const createdDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Date unavailable";

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-4 pb-14 pt-7 sm:px-6 lg:px-8 lg:pt-10">
        {/* Navigation */}
        <div className="mb-9 flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/customer/orders"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-orange-600"
          >
            <ArrowLeft size={16} />
            My orders
          </Link>

          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-orange-600"
          >
            <RefreshCw size={15} />
            Refresh status
          </button>
        </div>

        {/* Main order header */}
        <section className="border-b border-slate-100 pb-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-orange-600">
                  FoodieHub order
                </p>

                <StatusBadge status={order.orderType === "delivery" && ["failed", "cancelled"].includes(order.deliveryTracking?.status) ? order.deliveryTracking.status : order.status} />
              </div>

              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {justPlaced
                  ? "Your order is placed!"
                  : progressDescription}
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                {justPlaced
                  ? "Your order has been sent to the restaurant. You can follow its progress here."
                  : "Your order information and status are updated automatically."}
              </p>
            </div>

            <div className="min-w-[180px] md:text-right">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Order number
              </p>

              <p className="mt-1 text-xl font-bold tracking-wide text-slate-900">
                #{order.orderNumber}
              </p>

              <p className="mt-2 text-xs text-slate-500">{createdDate}</p>
            </div>
          </div>

          {/* Restaurant information */}
          <div className="mt-8 flex flex-wrap gap-x-10 gap-y-5">
            <div className="flex items-start gap-3">
              <ShoppingBag
                size={19}
                className="mt-0.5 shrink-0 text-orange-600"
              />

              <div>
                <p className="text-xs text-slate-400">Restaurant</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {order.restaurant?.name || "Restaurant"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin
                size={19}
                className="mt-0.5 shrink-0 text-orange-600"
              />

              <div>
                <p className="text-xs text-slate-400">Branch</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {order.branch?.name || "Branch"}
                  {order.branch?.city ? `, ${order.branch.city}` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {isDineIn ? (
                <UtensilsCrossed
                  size={19}
                  className="mt-0.5 shrink-0 text-orange-600"
                />
              ) : (
                <PackageCheck
                  size={19}
                  className="mt-0.5 shrink-0 text-orange-600"
                />
              )}

              <div>
                <p className="text-xs text-slate-400">Order type</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {pretty(order.orderType)}
                  {order.table?.tableNumber
                    ? ` · Table ${order.table.tableNumber}`
                    : ""}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Order progress */}
        <section className="border-b border-slate-100 py-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Track your order
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Follow each stage until your order is completed.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <Clock3 size={15} />
              Auto-updates every 20 seconds
            </div>
          </div>

          <OrderProgress order={order} />
          {order.status === "cancelled" && order.paymentStatus === "paid" && (
            <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              This order is cancelled, but its payment remains paid. Refunds are processed separately by the restaurant; contact the restaurant or support if you need help.
            </p>
          )}

          {order.orderType === "delivery" && order.deliveryTracking && (() => {
            const tracking = order.deliveryTracking;
            const pickupAddress = tracking.pickup?.address || order.branch?.city || "Restaurant pickup";
            const deliveryAddress = tracking.destination?.address || address?.street || "Delivery address";
            const mapOrigin = tracking.currentLocation ? `${tracking.currentLocation.latitude},${tracking.currentLocation.longitude}` : tracking.pickup?.latitude != null && tracking.pickup?.longitude != null ? `${tracking.pickup.latitude},${tracking.pickup.longitude}` : pickupAddress;
            const mapDestination = tracking.destination?.latitude != null && tracking.destination?.longitude != null ? `${tracking.destination.latitude},${tracking.destination.longitude}` : deliveryAddress;
            const routeUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(mapOrigin)}&destination=${encodeURIComponent(mapDestination)}`;
            const embeddedRoute = `https://maps.google.com/maps?output=embed&saddr=${encodeURIComponent(mapOrigin)}&daddr=${encodeURIComponent(mapDestination)}`;
            const isTerminal = ["delivered", "failed", "cancelled", "rejected"].includes(tracking.status);
            return <section className="mt-8 rounded-2xl border border-orange-100 bg-orange-50/40 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-wider text-orange-700">Delivery tracking</p><h3 className="mt-1 text-xl font-extrabold text-slate-900">{tracking.status === "pending_assignment" ? "Finding a delivery employee" : pretty(tracking.status)}</h3><p className="mt-1 text-sm text-slate-600">{tracking.status === "pending_assignment" ? "Your restaurant is preparing your delivery assignment." : "Delivery updates refresh automatically."}</p></div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${tracking.status === "delivered" ? "bg-emerald-100 text-emerald-800" : ["failed", "cancelled", "rejected"].includes(tracking.status) ? "bg-rose-100 text-rose-800" : "bg-orange-100 text-orange-800"}`}>{pretty(tracking.status)}</span>
              </div>

              {tracking.employee && !isTerminal && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white bg-white p-4"><div className="flex items-center gap-3">{tracking.employee.profilePhotoUrl ? <img src={tracking.employee.profilePhotoUrl} alt="" className="h-11 w-11 rounded-full object-cover"/> : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-orange-700"><UserRound size={20}/></span>}<div><p className="text-xs text-slate-500">Your delivery employee</p><p className="font-bold text-slate-900">{tracking.employee.firstName}</p></div></div>{tracking.employee.phone && <a href={`tel:${tracking.employee.phone}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"><Phone size={15}/>Call employee</a>}</div>}

              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Pickup · {pretty(tracking.restaurantStatus || order.status)}</p><p className="mt-1 font-semibold text-slate-900">{tracking.pickup?.name || order.restaurant?.name || "Restaurant"}</p><p className="mt-1 text-sm leading-5 text-slate-600">{pickupAddress}</p>{tracking.pickup?.phone && <a href={`tel:${tracking.pickup.phone}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-orange-700"><Phone size={13}/>Call restaurant</a>}<p className="mt-2 text-xs text-slate-500">Restaurant status updated {new Date(tracking.restaurantStatusUpdatedAt || order.updatedAt).toLocaleString()}</p></div><div className="rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Delivery address</p><p className="mt-1 text-sm leading-5 text-slate-700">{deliveryAddress}</p></div></div>

              {order.paymentMethod === "cash_on_delivery" && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-amber-800">Cash on delivery</p><p className="mt-1 text-sm text-slate-700">{tracking.codCollection?.status === "collected" || tracking.codCollection?.status === "reconciled" ? `Cash collected: ${money(tracking.codCollection.collectedAmount)}.` : `Payment due: ${money(tracking.codCollection?.expectedAmount ?? order.total)}. Pay your associate when the order arrives.`}</p></div>}
              <div className="mt-4 flex flex-wrap items-center gap-3"><a href={routeUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white"><Navigation size={15}/>Open pickup-to-delivery route</a>{tracking.eta ? <span className="text-sm font-semibold text-slate-700">Estimated arrival: {tracking.eta}</span> : <span className="text-xs text-slate-500">Estimated arrival is unavailable until reliable routing data is supported.</span>}</div>
              {tracking.pickup?.address && deliveryAddress && <iframe title="Restaurant pickup to customer route map" src={embeddedRoute} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="mt-4 h-64 w-full rounded-xl border border-slate-200 bg-white sm:h-80"/>}

              <div className="mt-4 rounded-xl bg-white p-4"><div className="flex items-center gap-2"><Truck size={16} className="text-orange-600"/><p className="text-sm font-bold text-slate-900">Live delivery location</p></div><p className="mt-1 text-sm text-slate-600">{tracking.liveLocationAvailable && tracking.currentLocation ? "The delivery employee is sharing a live location." : "Live location is not being shared for this delivery."}</p>{tracking.liveLocationAvailable && tracking.currentLocation && <a className="mt-2 inline-flex text-sm font-semibold text-orange-700" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${tracking.currentLocation.latitude},${tracking.currentLocation.longitude}`}>View current location</a>}</div>

              <div className="mt-5"><h4 className="text-sm font-bold text-slate-900">Delivery progress</h4>{tracking.history?.length ? <ol className="mt-3 space-y-3">{tracking.history.map((entry) => <li key={entry.id} className="flex gap-3"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500"/><div><p className="text-sm font-semibold text-slate-800">{entry.toStatus ? pretty(entry.toStatus) : pretty(entry.event)}</p><p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p></div></li>)}</ol> : <p className="mt-2 text-sm text-slate-500">Assignment updates will appear here as the restaurant confirms your order.</p>}</div>
            </section>;
          })()}

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {error}
            </div>
          )}
        </section>

        {/* Order and payment details */}
        <div className="grid items-start gap-12 pt-9 lg:grid-cols-[minmax(0,1fr)_350px] xl:gap-16">
          {/* Items */}
          <section>
            <div className="flex items-center justify-between pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Order details
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {order.items?.length || 0} items in this order
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {(order.items || []).map((item) => (
                <article
                  key={item.id}
                  className="flex items-center gap-4 py-5 sm:gap-5"
                >
                  {item.menuItem?.imageUrl ? (
                    <img
                      src={item.menuItem.imageUrl}
                      alt={item.itemName || "Food item"}
                      className="h-20 w-20 shrink-0 rounded-xl object-cover sm:h-24 sm:w-24"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-300 sm:h-24 sm:w-24">
                      <ShoppingBag size={24} />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {item.itemName}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Quantity: {item.quantity}
                      {item.variantName ? ` · ${item.variantName}` : ""}
                    </p>

                    {item.addonsSnapshot?.length > 0 && (
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        Add-ons:{" "}
                        {item.addonsSnapshot.map((a) => a.name).join(", ")}
                      </p>
                    )}
                  </div>

                  <p className="shrink-0 text-sm font-bold text-slate-900">
                    {money(item.lineTotal)}
                  </p>
                </article>
              ))}
            </div>

            {order.customerNotes && (
              <div className="mt-5 rounded-xl bg-orange-50/70 px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
                  Your instructions
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {order.customerNotes}
                </p>
              </div>
            )}

            {/* Delivery information */}
            {address && (
              <div className="mt-8 flex items-start gap-3">
                <MapPin className="mt-1 shrink-0 text-orange-600" size={19} />

                <div>
                  <h3 className="font-semibold text-slate-900">
                    Delivery address
                  </h3>

                  <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
                    {[
                      address.house,
                      address.street,
                      address.landmark,
                      address.city,
                      address.state,
                      address.postalCode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Payment summary */}
          <aside className="lg:sticky lg:top-8">
            <div className="rounded-2xl bg-slate-50/80 p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold tracking-tight text-slate-900">
                  Payment summary
                </h2>

                <CreditCard size={19} className="text-slate-400" />
              </div>

              <p className="mt-1 text-xs text-slate-500">
                A breakdown of your order total
              </p>

              <div className="mt-7 space-y-4">
                <SummaryRow label="Subtotal">
                  {money(order.subtotal)}
                </SummaryRow>

                <SummaryRow label="Tax & fees">
                  {money(taxAndFees)}
                </SummaryRow>

                <SummaryRow
                  label="Discount"
                  valueClassName="text-emerald-700"
                >
                  −{money(order.discount)}
                </SummaryRow>
              </div>

              <div className="mt-7 rounded-xl bg-white px-4 py-4">
                <p className="text-xs font-medium text-slate-500">
                  Total amount
                </p>

                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-2xl font-extrabold tracking-tight text-slate-900">
                    {money(order.total)}
                  </span>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      order.paymentStatus === "paid"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {paymentLabel}
                  </span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div>
                  <p className="text-xs text-slate-400">Payment method</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {pretty(order.paymentMethod || "Payment method")}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-500">
                    Payment status
                  </span>

                  <span
                    className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                      order.paymentStatus === "paid"
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    {order.paymentStatus === "paid" ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <Clock3 size={15} />
                    )}
                    {paymentLabel}
                  </span>
                </div>
                {order.refund && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4" role="status">
                    <p className="text-sm font-bold text-blue-900">Refund {pretty(order.refund.status)}</p>
                    <p className="mt-1 text-sm text-blue-800">{money(order.refund.amount)}{formatTimestamp(order.refund.createdAt) ? ` · requested ${formatTimestamp(order.refund.createdAt)}` : ""}</p>
                    {order.refund.status === "processed" && <p className="mt-1 text-xs text-blue-700">Razorpay has processed this refund. Your bank may take additional time to post it.</p>}
                    {order.refund.status === "pending" && <p className="mt-1 text-xs text-blue-700">The payment provider is processing your refund.</p>}
                  </div>
                )}
              </div>

              {/* Razorpay retry */}
              {order.paymentMethod === "razorpay" &&
                order.paymentStatus !== "paid" &&
                !["cancelled", "rejected", "completed"].includes(
                  order.status
                ) &&
                order.idempotencyKey && (
                  <div className="mt-6">
                    <p className="mb-3 text-sm leading-5 text-slate-500">
                      Your online payment is not confirmed. You can retry
                      securely.
                    </p>

                    <button
                      type="button"
                      onClick={retryPayment}
                      disabled={paymentBusy}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {paymentBusy ? (
                        <>
                          <LoaderCircle
                            size={17}
                            className="animate-spin"
                          />
                          Opening secure payment...
                        </>
                      ) : (
                        <>
                          Retry online payment
                          <ArrowRight size={17} />
                        </>
                      )}
                    </button>
                  </div>
                )}

              <div className="mt-6 flex items-start gap-2 text-xs leading-5 text-slate-400">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                <p>Your payment information is handled securely.</p>
              </div>
            </div>
          </aside>
        </div>

        {/* Bottom actions */}
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-7">
          <button type="button" onClick={reorder} disabled={reorderBusy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">
            {reorderBusy ? <LoaderCircle size={16} className="animate-spin"/> : <ShoppingBag size={16}/>}Order again
          </button>
          {reorderMessage && <p role="alert" className="w-full rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{reorderMessage}</p>}
          {order.status === "pending" && (
            <button type="button" onClick={cancelOrder} disabled={cancellationBusy} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
              {cancellationBusy ? <LoaderCircle size={16} className="animate-spin"/> : <XCircle size={16}/>}Cancel order
            </button>
          )}
          <Link
            to="/customer/orders"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-orange-600"
          >
            <ArrowLeft size={16} />
            All my orders
          </Link>

          <Link
            to="/restaurants"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Explore restaurants
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </main>
  );
}

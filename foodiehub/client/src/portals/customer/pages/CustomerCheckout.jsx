import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Check,
  ChevronRight,
  CreditCard,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Plus,
  ShieldCheck,
  Store,
  Utensils,
} from "lucide-react";
import { api } from "../../../services/api";
import AddressLocationPicker from "../../../components/AddressLocationPicker";
import { createBrowserUuidV4 } from "../../../utils/uuid";

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
const errorText = (error) =>
  error.response?.data?.message || error.message || "Unable to continue checkout.";
const blankAddress = {
  fullName: "",
  phone: "",
  house: "",
  street: "",
  landmark: "",
  city: "",
  state: "",
  postalCode: "",
  latitude: "",
  longitude: "",
  addressType: "home",
  isDefault: false,
};

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector('script[data-razorpay-checkout="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function Section({ number, title, subtitle, icon: Icon, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
          <Icon size={19} />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-600">
            Step {number}
          </p>
          <h2 className="mt-0.5 text-base font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function PaymentCard({ checked, onChange, icon: Icon, title, subtitle, badge, children }) {
  return (
    <label
      className={`block cursor-pointer rounded-2xl border p-4 transition ${
        checked
          ? "border-orange-400 bg-orange-50/70 ring-2 ring-orange-100"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <input
        className="sr-only"
        type="radio"
        name="paymentMethod"
        checked={checked}
        onChange={onChange}
      />
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            checked ? "bg-white text-orange-600" : "bg-slate-100 text-slate-500"
          }`}
        >
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900">{title}</p>
            {badge && (
              <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          {children}
        </div>
        <span
          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            checked ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300"
          }`}
        >
          {checked && <Check size={12} strokeWidth={3} />}
        </span>
      </div>
    </label>
  );
}

export default function CustomerCheckout() {
  const navigate = useNavigate();
  const submissionKey = useRef(null);
  const submissionKeyCartId = useRef(null);
  const pendingVerification = useRef(null);
  const [cart, setCart] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [orderType, setOrderType] = useState("delivery");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [summary, setSummary] = useState(null);
  const [addressForm, setAddressForm] = useState(blankAddress);
  const [showAddress, setShowAddress] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [couponSource, setCouponSource] = useState("platform_food");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.get("/customer/cart"), api.get("/customer/addresses")])
      .then(([cartResponse, addressResponse]) => {
        if (!active) return;
        const currentCart = cartResponse.data.data;
        setCart(currentCart);
        const branch = currentCart?.branch;
        if (currentCart?.table?.number) {
          setOrderType("dine_in");
        } else if (branch) {
          let preference = null;
          try { preference = JSON.parse(sessionStorage.getItem("foodiehub-order-preference") || "null"); } catch { preference = null; }
          const enabled = { delivery: branch.deliveryEnabled, takeaway: branch.takeawayEnabled, dine_in: branch.dineInEnabled };
          if (preference?.restaurantId === currentCart.restaurant?.id && preference?.branchId === branch.id && enabled[preference.orderType] && preference.orderType !== "dine_in") {
            setOrderType(preference.orderType);
            sessionStorage.removeItem("foodiehub-order-preference");
          } else if (!branch.deliveryEnabled) {
            setOrderType(branch.takeawayEnabled ? "takeaway" : "delivery");
          }
        }
        const list = addressResponse.data.data || [];
        setAddresses(list);
        setAddressId(list.find((address) => address.isDefault)?.id || list[0]?.id || "");
      })
      .catch((err) => {
        if (active) setError(errorText(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loading || !cart?.items?.length || (orderType === "delivery" && !addressId)) {
      return undefined;
    }
    let active = true;
    api
      .get("/customer/checkout/summary", {
        params: { orderType, ...(orderType === "delivery" ? { addressId } : {}), ...(appliedCouponCode ? { couponCode: appliedCouponCode, couponSource } : {}) },
      })
      .then((response) => {
        if (!active) return;
        const data = response.data.data;
        setSummary(data);
        setError("");
        setPaymentMethod((current) =>
          data.paymentMethods.includes(current)
            ? current
            : data.paymentMethods.includes("cash_on_delivery")
              ? "cash_on_delivery"
              : data.paymentMethods[0] || "",
        );
      })
      .catch((err) => {
        if (active) {
          setSummary(null);
          setError(errorText(err));
        }
      });
    return () => {
      active = false;
    };
  }, [loading, cart?.items?.length, orderType, addressId, appliedCouponCode, couponSource]);

  const services = useMemo(
    () =>
      [
        ["delivery", "Delivery", cart?.branch?.deliveryEnabled],
        ["takeaway", "Takeaway", cart?.branch?.takeawayEnabled],
        ["dine_in", "Dine-in", cart?.branch?.dineInEnabled],
      ].filter((service) => service[2] && (!cart?.table?.number || service[0] === "dine_in")),
    [cart],
  );
  const summaryReady = Boolean(summary && summary.orderType === orderType && (orderType !== "delivery" || summary.address?.id === addressId));
  const currentSummary = summaryReady ? summary : null;
  const methods = currentSummary?.paymentMethods || [];
  const total = Number(currentSummary?.total ?? 0);

  async function getSubmissionKey() {
    const cartId = cart?.cart?.id;
    const scope = cartId || "current-cart";
    if (submissionKey.current && submissionKeyCartId.current === scope) return submissionKey.current;

    const storageKey = `foodiehub.checkout.idempotency:${scope}`;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
        submissionKey.current = stored;
        submissionKeyCartId.current = scope;
        return stored;
      }
    } catch { /* The in-memory key still survives retries in this checkout view. */ }

    let key = createBrowserUuidV4();
    if (!key) {
      const response = await api.post("/customer/checkout/idempotency-key");
      key = response.data.data.idempotencyKey;
    }
    submissionKey.current = key;
    submissionKeyCartId.current = scope;
    try { sessionStorage.setItem(storageKey, key); } catch { /* Keep the key in memory for this checkout view. */ }
    return key;
  }

  const clearSubmissionKey = useCallback(() => {
    const scope = submissionKeyCartId.current || cart?.cart?.id || "current-cart";
    try { sessionStorage.removeItem(`foodiehub.checkout.idempotency:${scope}`); } catch { /* No persistent key to clear. */ }
    submissionKey.current = null;
    submissionKeyCartId.current = null;
  }, [cart?.cart?.id]);

  async function saveAddress(event) {
    event.preventDefault();
    setError("");
    setSavingAddress(true);
    try {
      const response = await api.post("/customer/addresses", addressForm);
      const address = response.data.data;
      const list = await api.get("/customer/addresses");
      setAddresses(list.data.data || []);
      setAddressId(address.id);
      setAddressForm(blankAddress);
      setShowAddress(false);
      setNotice("Delivery address saved.");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSavingAddress(false);
    }
  }

  const checkoutBody = () => ({
    orderType,
    paymentMethod,
    ...(orderType === "delivery" ? { addressId } : {}),
    ...(appliedCouponCode ? { couponCode: appliedCouponCode, couponSource } : {}),
    orderNotes,
  });

  const verifyPayment = useCallback(async (paymentResponse, orderId) => {
    await api.post(`/customer/orders/${orderId}/payments/razorpay/verify`, paymentResponse);
    pendingVerification.current = null;
    setVerificationPending(false);
    clearSubmissionKey();
    navigate(`/customer/orders/${orderId}`, { replace: true, state: { justPlaced: true } });
  }, [clearSubmissionKey, navigate]);

  async function retryVerification() {
    if (!pendingVerification.current) return;
    setBusy(true);
    setError("");
    try {
      await verifyPayment(pendingVerification.current.response, pendingVerification.current.orderId);
    } catch (err) {
      setError(`${errorText(err)} Your payment will only be confirmed after the server verifies it.`);
    } finally {
      setBusy(false);
    }
  }

  async function placeOrder() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const body = checkoutBody();
      await api.post("/customer/checkout/validate", body);
      const idempotencyKey = await getSubmissionKey();

      if (paymentMethod === "cash_on_delivery") {
        const response = await api.post("/customer/orders", {
          ...body,
          idempotencyKey,
        });
        clearSubmissionKey();
        navigate(`/customer/orders/${response.data.data.order.id}`, {
          replace: true,
          state: { justPlaced: true },
        });
        return;
      }

      const response = await api.post("/customer/checkout/razorpay/order", {
        ...body,
        idempotencyKey,
      });
      const payment = response.data.data;
      const loaded = await loadRazorpay();
      if (!loaded || !window.Razorpay) throw new Error("Razorpay Checkout could not be loaded. Check your connection and try again.");

      const checkout = new window.Razorpay({
        key: payment.keyId,
        order_id: payment.razorpayOrderId,
        amount: payment.amount,
        currency: payment.currency,
        name: "FoodieHub",
        description: `Order ${payment.orderNumber}`,
        image: currentSummary?.restaurant?.logo || undefined,
        prefill: payment.customer,
        notes: { orderNumber: payment.orderNumber },
        theme: { color: "#f97316" },
        handler: async (paymentResponse) => {
          pendingVerification.current = { response: paymentResponse, orderId: payment.orderId };
          setVerificationPending(true);
          try {
            await verifyPayment(paymentResponse, payment.orderId);
          } catch (err) {
            setError(`${errorText(err)} Retry verification below; your order is not marked paid yet.`);
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            api.post(`/customer/orders/${payment.orderId}/payments/razorpay/cancel`, { razorpayOrderId: payment.razorpayOrderId }).catch(() => {});
            setBusy(false);
            setNotice("Payment window closed. Your order is still unpaid; you can safely try again.");
          },
        },
      });
      checkout.on("payment.failed", async (event) => {
        const failure = event.error?.metadata;
        if (failure?.payment_id && failure?.order_id) {
          await api.post(`/customer/orders/${payment.orderId}/payments/razorpay/failure`, {
            paymentId: failure.payment_id,
            razorpayOrderId: failure.order_id,
          }).catch(() => {});
        }
        setBusy(false);
        setError(event.error?.description || "Payment did not complete. Your order remains unpaid; you can retry securely.");
      });
      checkout.open();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="text-center">
          <LoaderCircle className="mx-auto animate-spin text-orange-500" size={30} />
          <p className="mt-3 text-sm text-slate-500">Preparing your checkout…</p>
        </div>
      </div>
    );
  }

  if (!cart?.items?.length) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500"><Utensils /></span>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Your cart is empty</h1>
        <p className="mt-2 text-sm text-slate-500">Pick something delicious and come back when you’re ready.</p>
        <Link to="/restaurants" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white">Browse restaurants <ChevronRight size={16} /></Link>
      </section>
    );
  }

  const primaryLabel = paymentMethod === "razorpay" ? `Pay ${money(total)}` : "Place order";
  const placeDisabled = busy || !currentSummary || !methods.includes(paymentMethod) || (orderType === "delivery" && !addressId);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24 xl:pb-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link to="/customer/cart" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-orange-600"><ArrowLeft size={14} /> Back to cart</Link>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-orange-600">Almost there</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Checkout</h1>
          <p className="mt-2 text-sm text-slate-500">Review your order and choose how you’d like to pay.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><ShieldCheck size={16} /> Secure checkout</div>
      </header>

      {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span>{verificationPending && <button onClick={retryVerification} disabled={busy} className="shrink-0 rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Retry verification</button>}</div>}
      {notice && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="space-y-5">
          <Section number="01" title="Fulfilment" subtitle="Choose how you’d like to receive your order." icon={Store}>
            <div className="grid gap-2 sm:grid-cols-3">
              {services.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setOrderType(value)} className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold transition ${orderType === value ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <span className="flex items-center justify-between">{label}{orderType === value && <Check size={15} />}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
              {currentSummary?.restaurant?.logo ? <img src={currentSummary.restaurant.logo} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-orange-500"><Store size={19} /></span>}
              <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{cart.restaurant?.name || currentSummary?.restaurant?.name}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />{cart.branch?.name}{cart.branch?.city ? ` · ${cart.branch.city}` : ""}</p>{cart.table?.number && <p className="mt-1 text-xs font-bold text-orange-700">Dine-in · Table {cart.table.number}</p>}</div>
              <BadgeCheck className="ml-auto shrink-0 text-emerald-500" size={18} />
            </div>
          </Section>

          <Section number="02" title={orderType === "delivery" ? "Delivery address" : "Customer details"} subtitle={orderType === "delivery" ? "Choose where your food should arrive." : "Your order is for pickup at the selected branch."} icon={MapPin}>
            {orderType === "delivery" ? (
              addresses.length ? <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((address) => <label key={address.id} className={`cursor-pointer rounded-2xl border p-4 transition ${addressId === address.id ? "border-orange-400 bg-orange-50/60 ring-2 ring-orange-100" : "border-slate-200 hover:border-slate-300"}`}><span className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-800">{address.fullName}</span><span className="flex items-center gap-2"><span className="text-[10px] font-semibold uppercase text-slate-400">{address.addressType || "Address"}{address.isDefault ? " · Default" : ""}</span><input type="radio" name="address" checked={addressId === address.id} onChange={() => setAddressId(address.id)} className="accent-orange-500" /></span></span><p className="mt-2 text-xs leading-5 text-slate-500">{[address.house, address.street, address.landmark, address.city, address.state, address.postalCode].filter(Boolean).join(", ")}</p><p className="mt-1 text-xs text-slate-500">{address.phone}</p></label>)}
              </div> : <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center"><p className="text-sm font-semibold text-slate-700">Add a delivery address to continue</p><p className="mt-1 text-xs text-slate-500">Your address is saved securely to your customer account.</p></div>
            ) : <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-800">{orderType === "dine_in" ? `Dine-in at ${cart.branch?.name}` : `Pickup at ${cart.branch?.name}`}</p>{cart.table?.number && <p className="mt-1 text-sm font-bold text-orange-700">Table {cart.table.number}</p>}<p className="mt-1 text-xs text-slate-500">No delivery address is needed for {orderType.replace("_", " ")}.</p></div>}

            <button type="button" onClick={() => setShowAddress((shown) => !shown)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-orange-600"><Plus size={16} /> Add a new address</button>
            {showAddress && <form onSubmit={saveAddress} className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
              {[["fullName", "Full name"], ["phone", "Mobile number"], ["house", "House / flat"], ["street", "Street / area"], ["landmark", "Landmark (optional)"], ["city", "City"], ["state", "State"], ["postalCode", "Postal code"]].map(([name, label]) => <label key={name} className="text-xs font-semibold text-slate-600">{label}<input required={name !== "landmark"} value={addressForm[name]} onChange={(event) => setAddressForm((form) => ({ ...form, [name]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400" /></label>)}
              <div className="sm:col-span-2"><AddressLocationPicker latitude={addressForm.latitude} longitude={addressForm.longitude} onCoordinatesChange={(latitude, longitude) => setAddressForm((form) => ({ ...form, latitude, longitude }))} onAddressChange={(locationAddress) => setAddressForm((form) => ({ ...form, ...locationAddress }))} /></div>
              <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={addressForm.isDefault} onChange={(event) => setAddressForm((form) => ({ ...form, isDefault: event.target.checked }))} className="accent-orange-500" /> Set as default address</label>
              <div className="flex items-center justify-end"><button disabled={savingAddress} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{savingAddress ? "Saving…" : "Save address"}</button></div>
            </form>}
          </Section>

          <Section number="03" title="Order instructions" subtitle="Optional notes for the restaurant." icon={Utensils}>
            <textarea maxLength={2000} rows={3} value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} placeholder="Allergies, preparation preferences, or delivery notes" className="w-full resize-y rounded-2xl border border-slate-200 p-3.5 text-sm outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
            <p className="mt-1 text-right text-[10px] text-slate-400">{orderNotes.length}/2,000</p>
          </Section>

          <Section number="04" title="Payment method" subtitle="Available options are confirmed by the restaurant and FoodieHub." icon={CreditCard}>
            <div className="space-y-3">
              {methods.includes("cash_on_delivery") && <PaymentCard checked={paymentMethod === "cash_on_delivery"} onChange={() => setPaymentMethod("cash_on_delivery")} icon={Banknote} title="Cash on delivery" subtitle="Pay when your order arrives." badge="Available" />}
              {methods.includes("razorpay") && <PaymentCard checked={paymentMethod === "razorpay"} onChange={() => setPaymentMethod("razorpay")} icon={CreditCard} title="Online payment" subtitle="Pay securely with Razorpay." badge="Secure payment"><div className="mt-2 flex flex-wrap gap-1.5">{["UPI", "Credit / debit cards", "Net banking", "Wallets*"].map((label) => <span key={label} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-semibold text-slate-500">{label}</span>)}</div><p className="mt-2 text-[10px] leading-4 text-slate-400">Payment methods shown by Razorpay depend on your account configuration.</p></PaymentCard>}
              {!methods.length && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-bold text-amber-900">{currentSummary ? "No payment method is available" : "Updating available payment methods…"}</p><p className="mt-1 text-xs leading-5 text-amber-800">{currentSummary?.paymentConfiguration?.razorpay?.message || "Payment options are checked securely for this branch."}</p></div>}
              {methods.length > 0 && currentSummary?.paymentConfiguration?.razorpay?.configured === false && <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-500">Razorpay online payment is not configured. Contact FoodieHub support if you need help.</p>}
            </div>
            {paymentMethod === "razorpay" && <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-800"><ShieldCheck className="mt-0.5 shrink-0" size={15} /> Payment is confirmed by FoodieHub’s server after Razorpay verifies it. Your order stays unpaid until then.</p>}
          </Section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-5">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-600">Your order</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">Order summary</h2><p className="mt-1 text-xs text-slate-500">{currentSummary?.restaurant?.name || cart.restaurant?.name} · {cart.branch?.name}</p></div>
            <div className="divide-y divide-slate-100 px-5">
              {(currentSummary?.items || cart.items || []).map((item) => <div key={item.id} className="flex gap-3 py-4">
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-slate-100 object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-400"><ImageIcon size={20} /></span>}
                <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold text-slate-800">{item.quantity} × {item.name || item.item?.name || "Menu item"}</p><p className="mt-1 truncate text-[10px] text-slate-400">{[item.variant?.name, ...(item.addons || []).map((addon) => addon.name)].filter(Boolean).join(" · ") || "Freshly prepared"}</p><p className="mt-1 text-xs text-slate-500">{money(item.unitPrice)} each</p></div>
                <strong className="shrink-0 text-sm text-slate-800">{money(item.lineTotal ?? Number(item.unitPrice || 0) * item.quantity)}</strong>
              </div>)}
            </div>
            <div className="space-y-2.5 border-t border-slate-100 px-5 py-5 text-sm text-slate-600">
              <div className="rounded-xl border border-slate-200 p-3"><label htmlFor="food-coupon-source" className="text-xs font-bold text-slate-700">Food coupon source</label><select id="food-coupon-source" value={couponSource} onChange={(event) => setCouponSource(event.target.value)} disabled={busy} className="mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="platform_food">FoodieHub platform coupon</option><option value="restaurant_food">{cart.restaurant?.name || "This restaurant"} coupon</option></select><label htmlFor="food-coupon" className="mt-3 block text-xs font-bold text-slate-700">Coupon code</label><div className="mt-2 flex gap-2"><input id="food-coupon" value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} maxLength={40} placeholder="Enter coupon code" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase outline-none focus:border-orange-400"/><button type="button" onClick={() => { setSummary(null); setAppliedCouponCode(couponCode.trim().toUpperCase()); }} disabled={!couponCode.trim() || busy} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Apply</button>{appliedCouponCode && <button type="button" onClick={() => { setCouponCode(""); setAppliedCouponCode(""); setSummary(null); }} className="rounded-lg border px-3 py-2 text-xs font-bold">Clear</button>}</div>{currentSummary?.coupon && <p className="mt-2 text-xs font-semibold text-emerald-700">{currentSummary.coupon.code} applied · {currentSummary.coupon.source === "restaurant_food" ? "Restaurant coupon" : "FoodieHub platform coupon"}</p>}</div>
              <p className="flex justify-between"><span>Subtotal</span><span>{money(currentSummary?.subtotal ?? cart.subtotal)}</span></p>
              <p className="flex justify-between"><span>Discount</span><span className="text-emerald-600">−{money(currentSummary?.discount)}</span></p>
              <p className="flex justify-between"><span>Tax</span><span>{money(currentSummary?.tax)}</span></p>
              <p className="flex justify-between"><span>Delivery fee</span><span>{money(currentSummary?.deliveryFee)}</span></p>
              <p className="flex justify-between"><span>Packaging fee</span><span>{money(currentSummary?.packagingFee)}</span></p>
              <div className="flex items-end justify-between border-t border-dashed border-slate-200 pt-4"><span className="font-bold text-slate-900">Total payable</span><span className="text-2xl font-extrabold tracking-tight text-slate-950">{money(currentSummary?.total ?? cart.subtotal)}</span></div>
              <p className="text-[10px] leading-4 text-slate-400">Coupon eligibility and discounts are checked by FoodieHub at checkout. Fees and taxes are not configured.</p>
              <button onClick={placeOrder} disabled={placeDisabled} className="hidden w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 py-4 text-sm font-extrabold text-white shadow-lg shadow-orange-100 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 sm:flex">
                {busy ? <LoaderCircle className="animate-spin" size={17} /> : paymentMethod === "razorpay" ? <CreditCard size={17} /> : <Check size={17} />}
                {busy ? "Please wait…" : primaryLabel}
              </button>
              <p className="hidden items-center justify-center gap-1.5 text-[10px] text-slate-400 sm:flex"><ShieldCheck size={12} /> Secure payment · Your details are protected</p>
            </div>
          </section>
          <Link to="/customer/cart" className="hidden items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-orange-600 xl:flex"><ArrowLeft size={13} /> Return to your cart</Link>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_28px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total payable</p><p className="text-lg font-extrabold text-slate-950">{money(currentSummary?.total ?? cart.subtotal)}</p></div><button onClick={placeOrder} disabled={placeDisabled} className="flex min-w-[55%] items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3.5 text-sm font-extrabold text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : paymentMethod === "razorpay" ? <CreditCard size={16} /> : <Check size={16} />}{busy ? "Please wait…" : primaryLabel}</button></div>
      </div>
    </div>
  );
}

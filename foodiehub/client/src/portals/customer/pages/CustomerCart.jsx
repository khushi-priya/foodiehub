

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  LoaderCircle,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  ArrowLeft,
  ArrowRight,
  MapPin,
  UtensilsCrossed,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Store,
} from "lucide-react";
import { api } from "../../../services/api";

const errorText = (e) =>
  e.response?.data?.message || "Unable to load your cart.";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(value || 0));
const notifyCartUpdated = (cart) => window.dispatchEvent(new CustomEvent("foodiehub:cart-updated", { detail: cart }));

export default function CustomerCart() {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const r = await api.get("/customer/cart");
      setCart(r.data.data);
      notifyCartUpdated(r.data.data);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function change(line, quantity) {
    setBusy(line.id);
    setError("");
    setNotice("");

    try {
      const r = await api.patch(`/customer/cart/items/${line.id}`, {
        quantity,
      });
      setCart(r.data.data);
      notifyCartUpdated(r.data.data);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  async function remove(line) {
    setBusy(line.id);
    setError("");
    setNotice("");

    try {
      const r = await api.delete(`/customer/cart/items/${line.id}`);
      setCart(r.data.data);
      notifyCartUpdated(r.data.data);
      setNotice(`${line.name || "Item"} removed from your cart.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  async function clear() {
    if (!window.confirm("Are you sure you want to clear your cart?")) return;

    setBusy("clear");
    setError("");
    setNotice("");

    try {
      const r = await api.delete("/customer/cart");
      setCart(r.data.data);
      notifyCartUpdated(r.data.data);
      setNotice("Your cart has been cleared.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto grid min-h-[55vh] w-full max-w-7xl items-start gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <section className="space-y-4" aria-label="Loading cart">
          <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-28 animate-pulse rounded-2xl bg-white shadow-sm" />
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex gap-4 rounded-2xl border border-slate-100 bg-white p-4">
              <div className="h-24 w-24 animate-pulse rounded-xl bg-slate-200" />
              <div className="flex-1 space-y-3 py-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                <div className="h-8 w-28 animate-pulse rounded-lg bg-slate-100" />
              </div>
            </div>
          ))}
        </section>
        <div className="h-80 animate-pulse rounded-2xl bg-white shadow-sm" />
      </div>
    );
  }

  const items = cart?.items || [];
  const itemCount = items.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  );
  const hasUnavailableItems = items.some((item) => !item.available);
  const checkoutDisabled =
    cart?.tableUnavailable || hasUnavailableItems || !items.length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      {/* Page heading */}
      <div className="mb-8">
        <Link
          to="/restaurants"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-orange-600"
        >
          <ArrowLeft size={16} />
          Continue browsing
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl bg-gradient-to-r from-orange-50 via-white to-amber-50 p-5 sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
              Your order
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Your cart
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Check your items and quantities before checkout.
            </p>
          </div>

          {items.length > 0 && (
            <p className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">
              <ShoppingCart size={16} className="text-orange-600" />
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </p>
          )}
        </div>
      </div>

      {/* Feedback messages */}
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <CheckCircle2 size={18} className="shrink-0" />
          {notice}
        </div>
      )}

      {cart?.tableUnavailable && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900"
        >
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Table QR is no longer valid</p>
            <p className="mt-1 leading-6">
              This table QR has been deactivated or regenerated. Clear this
              cart and scan the current table QR before placing your order.
            </p>
          </div>
        </div>
      )}

      {!items.length ? (
        /* Empty cart */
        <section className="flex min-h-[390px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white px-5 py-16 text-center shadow-sm">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-orange-50 ring-8 ring-orange-50/50">
            <ShoppingCart size={31} className="text-orange-600" />
          </div>

          <h2 className="mt-6 text-xl font-bold text-slate-900">
            Your cart is waiting
          </h2>

          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Looks like you haven't added anything yet. Explore restaurants
            and discover something delicious.
          </p>

          <Link
            to="/restaurants"
            className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-600/20 transition hover:-translate-y-0.5 hover:bg-orange-700"
          >
            Explore restaurants
            <ArrowRight size={17} />
          </Link>
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-8">
          {/* Cart items */}
          <section className="min-w-0">
            {/* Restaurant information */}
            {cart.restaurant && (
              <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-orange-50 text-orange-500">
                        {cart.restaurant.logo ? <img src={cart.restaurant.logo} alt="" className="h-full w-full object-cover" /> : <Store size={20} />}
                      </div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Ordering from
                      </p>
                    </div>

                    <h2 className="mt-2 text-xl font-bold text-slate-900">
                      {cart.restaurant.name}
                    </h2>

                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                      <MapPin size={15} className="shrink-0" />
                      {cart.branch?.name}
                      {cart.branch?.city ? `, ${cart.branch.city}` : ""}
                    </p>

                    {cart.table?.number && (
                      <div className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-orange-700">
                        <UtensilsCrossed size={16} />
                        Dine-in · Table {cart.table.number}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={busy === "clear"}
                    onClick={clear}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    {busy === "clear" ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    Clear cart
                  </button>
                </div>
              </div>
            )}

            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-base font-extrabold text-slate-900">
                Order items
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
                {items.length} {items.length === 1 ? "product" : "products"}
              </span>
            </div>

            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 shadow-sm sm:px-5">
              {items.map((line) => (
                <article
                  key={line.id}
                  className={`flex gap-3 py-5 sm:gap-5 ${
                    !line.available ? "opacity-70" : ""
                  }`}
                >
                  {/* Food image */}
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-28 sm:w-28">
                    {line.imageUrl ? (
                      <img
                        src={line.imageUrl}
                        alt={line.name || "Menu item"}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-300">
                        <ShoppingCart size={27} />
                      </div>
                    )}
                  </div>

                  {/* Item information */}
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900">
                        {line.name || "Menu item"}
                      </h3>

                      <p className="mt-1 text-xs text-slate-500">
                        {line.variant?.name || "Regular"}
                      </p>

                      {line.addons?.length > 0 && (
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Add-ons: {line.addons.map((a) => a.name).join(", ")}
                        </p>
                      )}

                      {!line.available ? (
                        <p className="mt-2 text-sm font-medium text-red-600">
                          Unavailable: {line.unavailableReason}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">
                          {money(line.unitPrice)} each
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-end">
                      {line.available && (
                        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                          <button
                            type="button"
                            aria-label={`Decrease ${line.name} quantity`}
                            disabled={busy === line.id || line.quantity <= 1}
                            onClick={() => change(line, line.quantity - 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            {busy === line.id ? (
                              <LoaderCircle
                                size={15}
                                className="animate-spin"
                              />
                            ) : (
                              <Minus size={15} />
                            )}
                          </button>

                          <span className="min-w-8 text-center text-sm font-extrabold text-slate-900">
                            {line.quantity}
                          </span>

                          <button
                            type="button"
                            aria-label={`Increase ${line.name} quantity`}
                            disabled={busy === line.id || line.quantity >= 99}
                            onClick={() => change(line, line.quantity + 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      )}

                      <div className="flex min-w-[80px] items-center justify-end gap-3">
                        {line.available && (
                          <span className="text-sm font-bold text-slate-900">
                            {money(line.lineTotal)}
                          </span>
                        )}

                        <button
                          type="button"
                          aria-label={`Remove ${line.name} from cart`}
                          disabled={busy === line.id}
                          onClick={() => remove(line)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <Link
              to={
                cart.restaurant?.slug
                  ? `/restaurants/${cart.restaurant.slug}?branchId=${cart.branch?.id || ""}`
                  : "/restaurants"
              }
              className="mt-5 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-orange-700 transition hover:bg-orange-50"
            >
              <ArrowLeft size={16} />
              Add more items
            </Link>
          </section>

          {/* Order summary */}
          <aside className="lg:sticky lg:top-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-slate-900">
                  Order summary
                </h2>
                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-700">{itemCount} {itemCount === 1 ? "item" : "items"}</span>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                {cart.restaurant?.name}
                {cart.branch?.name ? ` · ${cart.branch.name}` : ""}
              </p>

              {cart.table?.number && (
                <p className="mt-3 flex items-center gap-2 text-sm font-medium text-orange-700">
                  <UtensilsCrossed size={15} />
                  Dine-in · Table {cart.table.number}
                </p>
              )}

              <div className="mt-5 space-y-3 border-b border-slate-100 pb-5">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-medium text-slate-900">
                    {money(cart.subtotal)}
                  </span>
                </div>

                <div className="flex justify-between text-sm text-slate-600">
                  <span>Additional charges</span>
                  <span className="font-medium text-slate-900">
                    {money(0)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 py-5">
                <span className="font-bold text-slate-900">
                  Total before checkout
                </span>
                <span className="text-xl font-black text-slate-950">
                  {money(cart.subtotal)}
                </span>
              </div>

              <p className="mb-5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                Tax, delivery and packaging charges are not configured, so no
                additional fees are added. Final charges are confirmed at
                checkout.
              </p>

              {hasUnavailableItems && (
                <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-700">
                  Remove unavailable items before proceeding to checkout.
                </p>
              )}

              <Link
                to="/customer/checkout"
                aria-disabled={checkoutDisabled || undefined}
                onClick={(event) => {
                  if (checkoutDisabled) event.preventDefault();
                }}
                className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 py-4 text-sm font-extrabold transition ${
                  checkoutDisabled
                    ? "cursor-not-allowed bg-slate-300 text-slate-500"
                    : "bg-orange-600 text-white hover:bg-orange-700"
                }`}
              >
                Proceed to checkout
                <ArrowRight size={17} />
              </Link>

              <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
                <ShieldCheck size={14} className="text-emerald-600" />
                Secure checkout · Your details are protected
              </p>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

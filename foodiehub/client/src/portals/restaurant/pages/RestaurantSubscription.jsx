import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, RefreshCw } from "lucide-react";
import { api } from "../../../services/api";

const money = (amount, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    Number(amount || 0),
  );
const date = (value) => (value ? new Date(value).toLocaleDateString() : "—");

export default function RestaurantSubscription() {
  const [plans, setPlans] = useState([]);
  const [current, setCurrent] = useState(null);
  const [paymentConfiguration, setPaymentConfiguration] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [couponCode, setCouponCode] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [planResponse, currentResponse] = await Promise.all([
        api.get("/restaurant/subscription/plans"),
        api.get("/restaurant/subscription/current"),
      ]);
      setPlans(planResponse.data.data || []);
      setCurrent(currentResponse.data.data || {});
      setPaymentConfiguration(
        currentResponse.data.data?.paymentConfiguration || {},
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not load subscription information.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function choosePlan(plan) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (Number(plan.price) > 0 && !paymentConfiguration.razorpayConfigured) {
        throw new Error(
          "Online payments are not configured yet. Contact your administrator.",
        );
      }
      if (Number(plan.price) > 0 && !window.Razorpay) {
        const loaded = await new Promise((resolve) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.async = true;
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
        if (!loaded || !window.Razorpay)
          throw new Error(
            "Razorpay Checkout could not be loaded. Check your connection and try again.",
          );
      }
      const response = await api.post("/restaurant/subscription/checkout", {
        planId: plan.id,
        idempotencyKey: crypto.randomUUID(),
        ...(couponCode.trim()
          ? { couponCode: couponCode.trim().toUpperCase() }
          : {}),
      });
      const payment = response.data.data;
      if (payment.free) {
        setNotice("Your free plan is active.");
        await load();
        setBusy(false);
        return;
      }
      const checkout = new window.Razorpay({
        key: payment.keyId,
        order_id: payment.razorpayOrderId,
        amount: payment.amount,
        currency: payment.currency,
        name: "FoodieHub",
        description: `${plan.name} subscription`,
        theme: { color: "#ea580c" },
        handler: async (result) => {
          try {
            await api.post("/restaurant/subscription/payments/verify", {
              paymentId: payment.paymentId,
              ...result,
            });
            setNotice("Payment verified. Your subscription is active.");
            await load();
          } catch (requestError) {
            setError(
              requestError.response?.data?.message ||
                "Payment is not confirmed yet. Refresh and check the subscription status.",
            );
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      checkout.on("payment.failed", async (event) => {
        const failure = event.error?.metadata;
        if (failure?.payment_id && failure?.order_id) {
          await api
            .post("/restaurant/subscription/payments/failure", {
              paymentId: payment.paymentId,
              razorpayOrderId: failure.order_id,
              razorpayPaymentId: failure.payment_id,
            })
            .catch(() => {});
        }
        setError(
          event.error?.description ||
            "Payment did not complete. You can start a new checkout.",
        );
        setBusy(false);
        await load();
      });
      checkout.open();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.message ||
          "Unable to start checkout.",
      );
      setBusy(false);
    }
  }

  const subscriptions = current?.subscriptions || [];
  const active = subscriptions.find((item) => item.displayStatus === "active");
  const pendingPayment = current?.pendingPayments?.[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-orange-600">
            Billing
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-900">
            Plans & subscription
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Choose a plan for your restaurant and review billing periods.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading || busy}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {notice}
        </div>
      )}
      {active && (
        <section className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-orange-700">
            Current plan
          </p>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-extrabold text-slate-900">
              {active.planSnapshot?.name || active.plan?.name}
            </h2>
            <p className="text-sm text-slate-600">
              Renews / ends {date(active.endDate)}
            </p>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {money(active.amount, active.currency)} ·{" "}
            {active.planSnapshot?.billingPeriod || active.plan?.billingPeriod}
          </p>
        </section>
      )}
      {pendingPayment && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          A payment for {pendingPayment.plan?.name || "a subscription plan"} is
          pending. Complete it or wait for its payment result before starting
          another checkout.
        </div>
      )}
      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Available plans
            </h2>
            {loading && (
              <span className="text-xs text-slate-500">Loading…</span>
            )}
          </div>
          <label className="text-xs font-semibold text-slate-600">
            Subscription coupon
            <input
              value={couponCode}
              onChange={(event) =>
                setCouponCode(event.target.value.toUpperCase())
              }
              maxLength={40}
              placeholder="Optional coupon code"
              className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm font-normal"
            />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {plan.name}
                </h3>
                {plan.description && (
                  <p className="mt-1 text-sm text-slate-500">
                    {plan.description}
                  </p>
                )}
                <p className="mt-5 text-3xl font-extrabold text-slate-900">
                  {money(plan.price, plan.currency)}
                  <span className="ml-1 text-sm font-medium text-slate-500">
                    /{plan.billingPeriod === "yearly" ? "year" : "month"}
                  </span>
                </p>
              </div>
              <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
                <div className="flex justify-between">
                  <dt>Branches</dt>
                  <dd className="font-semibold">
                    {plan.maxBranches ?? "Unlimited"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Team members</dt>
                  <dd className="font-semibold">
                    {plan.maxEmployees ?? "Unlimited"}
                  </dd>
                </div>
              </dl>
              {plan.features?.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {plan.features.map((feature, index) => (
                    <li
                      key={`${feature}-${index}`}
                      className="flex gap-2 text-sm text-slate-600"
                    >
                      <Check size={16} className="shrink-0 text-green-600" />
                      {feature}
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={() => choosePlan(plan)}
                disabled={busy || loading || Boolean(pendingPayment)}
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CreditCard size={16} />
                {busy
                  ? "Processing…"
                  : Number(plan.price) === 0
                    ? "Activate free plan"
                    : "Choose plan"}
              </button>
            </article>
          ))}
          {!loading && plans.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 p-8 text-sm text-slate-500">
              No active plans are available. Contact your administrator.
            </p>
          )}
        </div>
      </section>
      {subscriptions.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold text-slate-900">
            Subscription history
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subscriptions.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {item.planSnapshot?.name || item.plan?.name}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">
                      {item.displayStatus}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {date(item.startDate)} – {date(item.endDate)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {money(item.amount, item.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

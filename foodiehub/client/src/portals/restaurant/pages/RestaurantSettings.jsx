import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  CreditCard,
  FileText,
  KeyRound,
  LoaderCircle,
  MapPinned,
  Save,
  Settings2,
  ShieldCheck,
  Store,
  BellRing,
  Clock3,
} from "lucide-react";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";

const sections = [
  ["restaurant-information", "Restaurant Information", Store],
  ["notifications", "Notifications", BellRing],
  ["order-preferences", "Order Preferences", Settings2],
  ["payment-settings", "Payment Settings", CreditCard],
  ["tax-billing", "Tax & Billing", FileText],
  ["receipt-invoice", "Receipt & Invoice", FileText],
  ["operating-preferences", "Operating Preferences", Clock3],
  ["security", "Security", ShieldCheck],
  ["integrations", "Integrations", MapPinned],
];
const input =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50";
const statusStyle = {
  configured: "bg-emerald-50 text-emerald-700",
  not_configured: "bg-slate-100 text-slate-600",
  configuration_required: "bg-amber-50 text-amber-800",
  unavailable: "bg-slate-100 text-slate-600",
};
const errorText = (error) =>
  error.response?.data?.message || "Could not save settings. Please try again.";

function Status({ value }) {
  const text =
    {
      configured: "Configured",
      not_configured: "Not configured",
      configuration_required: "Configuration required",
      unavailable: "Unavailable",
    }[value] || "Unavailable";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[value] || statusStyle.unavailable}`}
    >
      {text}
    </span>
  );
}

function Panel({ icon: Icon, title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
          <Icon size={19} />
        </span>
        <div>
          <h2 className="font-extrabold text-slate-900">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function Unavailable({ title, message, status = "unavailable" }) {
  return (
    <Panel icon={FileText} title={title} description={message}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-sm text-slate-600">
          No active configuration is available in the current application.
        </p>
        <Status value={status} />
      </div>
    </Panel>
  );
}

export default function RestaurantSettings() {
  const { user } = useAuth();
  const { section = "restaurant-information" } = useParams();
  const navigate = useNavigate();
  const membership = useMemo(
    () =>
      (user?.restaurantMemberships || []).find(
        (item) =>
          item.status === "active" &&
          (typeof item.role === "string" ? item.role : item.role?.code) ===
            "restaurant_owner",
      ) ||
      (user?.restaurantMemberships || []).find(
        (item) => item.status === "active",
      ),
    [user],
  );
  const roleCode =
    typeof membership?.role === "string"
      ? membership.role
      : membership?.role?.code;
  const permissions = (membership?.role?.permissions || []).map((permission) =>
    typeof permission === "string" ? permission : permission.code,
  );
  const canUpdate =
    roleCode === "restaurant_owner" || permissions.includes("business.update");
  const selected = sections.some(([key]) => key === section)
    ? section
    : "restaurant-information";
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState({});
  const [ordersDraft, setOrdersDraft] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [hoursDraft, setHoursDraft] = useState(null);
  const [security, setSecurity] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!membership?.restaurantId) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/restaurant/settings", {
        params: { restaurantId: membership.restaurantId },
      });
      const value = response.data;
      setData(value);
      setProfile({
        name: value.restaurant?.name || "",
        email: value.restaurant?.email || "",
        phone: value.restaurant?.phone || "",
        description: value.restaurant?.description || "",
        logo: value.restaurant?.logo || "",
      });
      setOrdersDraft(Boolean(value.restaurant?.acceptingOrders));
      if (value.branches?.length)
        setBranchId((current) => current || value.branches[0].id);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [membership?.restaurantId]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!sections.some(([key]) => key === section))
      navigate("/restaurant/settings/restaurant-information", {
        replace: true,
      });
  }, [section, navigate]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.patch("/restaurant/settings/profile", profile, {
        params: { restaurantId: membership.restaurantId },
      });
      setNotice("Restaurant information saved.");
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };
  const cancelProfile = () => {
    const restaurant = data?.restaurant || {};
    setProfile({
      name: restaurant.name || "",
      email: restaurant.email || "",
      phone: restaurant.phone || "",
      description: restaurant.description || "",
      logo: restaurant.logo || "",
    });
    setError("");
    setNotice("");
  };
  const saveOrderPreference = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.patch(
        "/restaurant/settings/orders",
        { acceptingOrders: ordersDraft },
        { params: { restaurantId: membership.restaurantId } },
      );
      setNotice(
        ordersDraft ? "Online orders resumed." : "New online orders paused.",
      );
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };
  const changePassword = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api.post(
        "/restaurant/settings/security/password",
        security,
        { params: { restaurantId: membership.restaurantId } },
      );
      setNotice(response.data.message || "Password changed.");
      setSecurity({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };

  const branch = data?.branches?.find((item) => item.id === branchId);
  useEffect(() => {
    if (!branch) {
      setHoursDraft(null);
      return;
    }
    setHoursDraft({
      openingTime: branch.openingTime?.slice(0, 5) || "",
      closingTime: branch.closingTime?.slice(0, 5) || "",
      workingDays: branch.workingDays || [],
      closedDays: branch.closedDays || [],
      overnight: Boolean(branch.overnight),
      timeZone: branch.timeZone || "Asia/Kolkata",
    });
  }, [branch]);
  const branchAddress = (item) =>
    [
      item.addressLine,
      item.addressLine2,
      item.city,
      item.state,
      item.postalCode,
      item.country,
    ]
      .filter(Boolean)
      .join(", ");
  const saveHours = async (event) => {
    event.preventDefault();
    if (!branch || !hoursDraft) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.patch(
        "/restaurant/business/hours",
        { branchId: branch.id, ...hoursDraft },
        { params: { restaurantId: membership.restaurantId } },
      );
      setNotice(`Operating hours saved for ${branch.name}.`);
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };
  const sectionContent = () => {
    if (selected === "restaurant-information")
      return (
        <Panel
          icon={Store}
          title="Restaurant Information"
          description="Manage restaurant-wide profile details. Addresses and branch contacts remain branch-specific."
        >
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Restaurant name", "name", "text"],
                ["Contact email", "email", "email"],
                ["Contact phone", "phone", "tel"],
                ["Logo image URL (HTTPS)", "logo", "url"],
              ].map(([title, key, type]) => (
                <label
                  key={key}
                  className="text-sm font-semibold text-slate-700"
                >
                  {title}
                  <input
                    className={input}
                    type={type}
                    required={key !== "logo"}
                    disabled={!canUpdate || saving}
                    value={profile[key] || ""}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              Description
              <textarea
                className={input}
                rows="4"
                maxLength="5000"
                disabled={!canUpdate || saving}
                value={profile.description || ""}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            <p className="text-xs text-slate-500">
              Restaurant addresses are not stored centrally. Edit branch
              addresses in{" "}
              <Link
                className="font-bold text-orange-600 hover:underline"
                to="/restaurant/branches"
              >
                Branches
              </Link>
              . Website is not currently supported.
            </p>
            {canUpdate && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelProfile}
                  disabled={saving}
                  className="min-h-10 rounded-xl border px-4 text-sm font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            )}
          </form>
        </Panel>
      );
    if (selected === "notifications")
      return (
        <Panel
          icon={BellRing}
          title="Notifications"
          description="FoodieHub currently has no restaurant notification preference service or configurable delivery channels."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "New orders",
              "Order cancellations",
              "Reservation requests",
              "Reservation cancellations",
              "Payment updates",
              "Employee activity",
              "Low inventory",
              "Delivery updates",
            ].map((name) => (
              <div
                key={name}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
              >
                <span className="text-sm font-semibold text-slate-700">
                  {name}
                </span>
                <Status value="unavailable" />
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            These are display-only capability indicators. No notification
            preferences are saved or implied.
          </p>
        </Panel>
      );
    if (selected === "order-preferences")
      return (
        <div className="space-y-4">
          <Panel
            icon={Settings2}
            title="Order Preferences"
            description="The existing order-acceptance control is enforced by checkout for new orders."
          >
            <form
              onSubmit={saveOrderPreference}
              className="flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <p className="font-bold text-slate-800">Accept online orders</p>
                <p className="mt-1 text-sm text-slate-500">
                  When paused, customers cannot place new orders. Existing
                  orders remain accessible.
                </p>
              </div>
              <label className="inline-flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">
                  {ordersDraft ? "On" : "Paused"}
                </span>
                <input
                  aria-label="Accept online orders"
                  type="checkbox"
                  className="size-5 accent-orange-500"
                  checked={ordersDraft}
                  disabled={!canUpdate || saving}
                  onChange={(event) => setOrdersDraft(event.target.checked)}
                />
              </label>
              {canUpdate && (
                <div className="flex w-full justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setOrdersDraft(Boolean(data?.restaurant?.acceptingOrders))
                    }
                    disabled={saving}
                    className="min-h-10 rounded-xl border px-4 text-sm font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={saving}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white"
                  >
                    <Save size={16} />
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              )}
            </form>
          </Panel>
          <Panel
            icon={Clock3}
            title="Additional order controls"
            description="Default preparation time, automatic acceptance, and customer cancellation rules are not implemented in the current order flow."
          >
            <Status value="unavailable" />
          </Panel>
        </div>
      );
    if (selected === "payment-settings")
      return (
        <Panel
          icon={CreditCard}
          title="Payment Settings"
          description="Payment availability is configured per branch. Change branch payment methods in Branch Management."
        >
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Branch
              <select
                className={input}
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="">Select a branch</option>
                {(data?.branches || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <Link
              className="min-h-10 rounded-xl border px-4 py-2 text-sm font-bold text-slate-700"
              to="/restaurant/branches"
            >
              Manage branches
            </Link>
          </div>
          {branch ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 p-4">
                <p className="font-bold text-slate-800">Cash on delivery</p>
                <p className="mt-1 text-sm text-slate-500">
                  {branch.cashOnDeliveryEnabled ? "Enabled" : "Disabled"} for{" "}
                  {branch.name}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 p-4">
                <p className="font-bold text-slate-800">
                  Razorpay online payments
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {branch.razorpayEnabled
                    ? "Enabled for this branch"
                    : "Disabled for this branch"}
                </p>
                <div className="mt-2">
                  <Status value={data?.integrations?.razorpay?.status} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No branch is available in your permitted scope.
            </p>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Payment methods and gateway credentials are not editable here.
            Secret credentials are never returned to this page.
          </p>
        </Panel>
      );
    if (selected === "tax-billing")
      return (
        <Unavailable
          title="Tax & Billing"
          status="configuration_required"
          message="Tax calculation is not configured in checkout. GSTIN and legal business details are not yet consumed by an invoice or tax workflow."
        />
      );
    if (selected === "receipt-invoice")
      return (
        <Unavailable
          title="Receipt & Invoice"
          message="There is no invoice generation or invoice-numbering service in the current application. Prefix and numbering controls are unavailable until that flow exists."
        />
      );
    if (selected === "operating-preferences")
      return (
        <Panel
          icon={Clock3}
          title="Operating Preferences"
          description="Currency is currently INR. Time zone and operating hours remain branch-specific."
        >
          <p className="mb-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            <strong>Currency:</strong> INR (fixed by the existing order and
            payment flow).
          </p>
          {(data?.branches || []).length > 0 && (
            <label className="mb-4 grid max-w-sm gap-1 text-sm font-semibold text-slate-700">
              Branch
              <select
                className={input}
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
              >
                {data.branches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {branch && hoursDraft ? (
            <>
              <div className="mb-4 rounded-xl border border-slate-100 p-4">
                <h3 className="font-bold text-slate-800">{branch.name}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {branchAddress(branch)}
                </p>
              </div>
              <form onSubmit={saveHours} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-700">
                    Opening time
                    <input
                      className={input}
                      type="time"
                      required
                      disabled={!canUpdate || saving}
                      value={hoursDraft.openingTime}
                      onChange={(event) =>
                        setHoursDraft((current) => ({
                          ...current,
                          openingTime: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm font-semibold text-slate-700">
                    Closing time
                    <input
                      className={input}
                      type="time"
                      required
                      disabled={!canUpdate || saving}
                      value={hoursDraft.closingTime}
                      onChange={(event) =>
                        setHoursDraft((current) => ({
                          ...current,
                          closingTime: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm font-semibold text-slate-700">
                    Time zone
                    <input
                      className={input}
                      required
                      disabled={!canUpdate || saving}
                      value={hoursDraft.timeZone}
                      onChange={(event) =>
                        setHoursDraft((current) => ({
                          ...current,
                          timeZone: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      className="size-5 accent-orange-500"
                      disabled={!canUpdate || saving}
                      checked={hoursDraft.overnight}
                      onChange={(event) =>
                        setHoursDraft((current) => ({
                          ...current,
                          overnight: event.target.checked,
                        }))
                      }
                    />
                    Overnight hours
                  </label>
                </div>
                <fieldset>
                  <legend className="text-sm font-semibold text-slate-700">
                    Open days
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((day) => (
                      <label
                        key={day}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          className="accent-orange-500"
                          disabled={!canUpdate || saving}
                          checked={hoursDraft.workingDays.includes(day)}
                          onChange={(event) =>
                            setHoursDraft((current) => ({
                              ...current,
                              workingDays: event.target.checked
                                ? [...current.workingDays, day]
                                : current.workingDays.filter(
                                    (value) => value !== day,
                                  ),
                            }))
                          }
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {canUpdate && (
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        setHoursDraft({
                          openingTime: branch.openingTime?.slice(0, 5) || "",
                          closingTime: branch.closingTime?.slice(0, 5) || "",
                          workingDays: branch.workingDays || [],
                          closedDays: branch.closedDays || [],
                          overnight: Boolean(branch.overnight),
                          timeZone: branch.timeZone || "Asia/Kolkata",
                        })
                      }
                      className="min-h-10 rounded-xl border px-4 text-sm font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={saving}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white"
                    >
                      <Save size={16} />
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                )}
              </form>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              No branch is available in your permitted scope.
            </p>
          )}
          <p className="mt-4 text-sm text-slate-500">
            Date and time display follow the current browser locale; saved
            format preferences are not supported.
          </p>
        </Panel>
      );
    if (selected === "security")
      return (
        <div className="space-y-4">
          <Panel
            icon={ShieldCheck}
            title="Account Security"
            description="Your current account session is authenticated through FoodieHub’s existing session-based login."
          >
            <p className="text-sm text-slate-700">
              <strong>Session:</strong>{" "}
              {data?.security?.sessionStatus === "active"
                ? "Active"
                : "Unavailable"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              <strong>Account:</strong>{" "}
              {data?.security?.accountEmail || user?.email || "—"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              <strong>Last login:</strong>{" "}
              {data?.security?.lastLoginAt
                ? new Date(data.security.lastLoginAt).toLocaleString()
                : "Not recorded"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              <strong>Session expiry:</strong>{" "}
              {data?.security?.sessionExpiresAt
                ? new Date(data.security.sessionExpiresAt).toLocaleString()
                : "Managed by the server"}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Signing out other sessions is not available in the current session
              store.
            </p>
          </Panel>
          <Panel
            icon={KeyRound}
            title="Change password"
            description="Uses your existing FoodieHub account and password hash. Passwords are never stored in plain text."
          >
            <form className="space-y-3" onSubmit={changePassword}>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Current password", "currentPassword"],
                  ["New password", "newPassword"],
                  ["Confirm new password", "confirmPassword"],
                ].map(([title, key]) => (
                  <label
                    key={key}
                    className="text-sm font-semibold text-slate-700"
                  >
                    {title}
                    <input
                      className={input}
                      type="password"
                      autoComplete={
                        key === "currentPassword"
                          ? "current-password"
                          : "new-password"
                      }
                      minLength="8"
                      required
                      disabled={!canUpdate || saving}
                      value={security[key]}
                      onChange={(event) =>
                        setSecurity((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Use 8–20 characters with upper and lowercase letters, a number
                and a symbol.
              </p>
              {canUpdate && (
                <div className="flex justify-end">
                  <button
                    disabled={saving}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white"
                  >
                    <KeyRound size={16} />
                    {saving ? "Updating…" : "Change password"}
                  </button>
                </div>
              )}
            </form>
          </Panel>
        </div>
      );
    const integrations = data?.integrations || {};
    const cards = [
      [
        "Razorpay",
        integrations.razorpay,
        "Configured when backend credentials exist; enabled separately per branch.",
      ],
      [
        "Email provider",
        integrations.email,
        "Employee invitation email delivery is not configured.",
      ],
      ["SMS provider", integrations.sms, "No SMS service is implemented."],
      [
        "WhatsApp provider",
        integrations.whatsapp,
        "No WhatsApp service is implemented.",
      ],
      [
        "Map/geocoding provider",
        integrations.maps,
        "Address search requires MAP_GEOCODER_BASE_URL. See docs/maps-and-location.md.",
      ],
    ];
    return (
      <Panel
        icon={MapPinned}
        title="Integrations"
        description="Configuration is detected on the server. Credentials and secret values are never sent to the browser."
      >
        <div className="space-y-3">
          {cards.map(([title, item, detail]) => (
            <article
              key={title}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-100 p-4"
            >
              <div>
                <h3 className="font-bold text-slate-800">{title}</h3>
                <p className="mt-1 text-sm text-slate-500">{detail}</p>
              </div>
              <Status value={item?.status} />
            </article>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Map configuration is described in docs/maps-and-location.md. Set
          server-side RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET for payments. Map
          search needs MAP_GEOCODER_BASE_URL; MAP_GEOCODER_API_KEY and
          MAP_GEOCODER_USER_AGENT are optional provider-specific settings.
        </p>
      </Panel>
    );
  };

  if (!membership)
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Restaurant membership is required to view settings.
      </div>
    );
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header>
        <p className="text-sm font-semibold text-orange-600">
          Restaurant workspace
        </p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">Settings</h1>
        <p className="mt-2 text-sm text-slate-600">
          Manage supported restaurant settings and review configuration
          requirements.
        </p>
      </header>
      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
        >
          {notice}
          <button className="ml-3 underline" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 lg:block lg:space-y-1 lg:overflow-visible lg:self-start"
        >
          {sections.map(([key, title, Icon]) => (
            <NavLink
              key={key}
              to={`/restaurant/settings/${key}`}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${isActive ? "bg-orange-50 text-orange-700" : "text-slate-600 hover:bg-slate-50"}`
              }
            >
              <Icon size={17} />
              {title}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 py-14 text-sm text-slate-500">
              <LoaderCircle className="animate-spin" size={18} />
              Loading settings…
            </div>
          ) : (
            sectionContent()
          )}
        </div>
      </div>
    </div>
  );
}

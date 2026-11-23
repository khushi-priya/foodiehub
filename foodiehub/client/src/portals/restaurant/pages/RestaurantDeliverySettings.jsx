import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Clock3,
  LoaderCircle,
  Save,
  Settings2,
  Truck,
} from "lucide-react";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";

const errorText = (error) =>
  error.response?.data?.message || "Could not save delivery settings.";
const fieldClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

export default function RestaurantDeliverySettings() {
  const { user } = useAuth();
  const membership = (user?.restaurantMemberships || []).find(
    (item) =>
      item.status === "active" && item.role?.code === "restaurant_owner",
  );
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [settings, setSettings] = useState({
    manualAssignmentEnabled: true,
    automaticAssignmentEnabled: false,
    maxActiveAssignments: 1,
    acceptanceTimeoutMinutes: 5,
    locationSharingEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingAvailability, setSavingAvailability] = useState(false);

  const load = useCallback(async () => {
    if (!membership?.restaurantId) return;
    setLoading(true);
    setError("");
    try {
      const [branchResponse, settingResponse] = await Promise.all([
        api.get("/restaurant/delivery/orders/branches", {
          params: { restaurantId: membership.restaurantId },
        }),
        api.get("/restaurant/delivery/settings", {
          params: {
            restaurantId: membership.restaurantId,
            branchId: branchId || undefined,
          },
        }),
      ]);
      setBranches(branchResponse.data.branches || []);
      setSettings((current) => ({
        ...current,
        ...(settingResponse.data.settings || {}),
      }));
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [membership?.restaurantId, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice("");
  };
  const save = async (event) => {
    event.preventDefault();
    if (!membership?.restaurantId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await api.patch(
        "/restaurant/delivery/settings",
        {
          branchId: branchId || null,
          manualAssignmentEnabled: settings.manualAssignmentEnabled,
          automaticAssignmentEnabled: settings.automaticAssignmentEnabled,
          maxActiveAssignments: Number(settings.maxActiveAssignments),
          acceptanceTimeoutMinutes: Number(settings.acceptanceTimeoutMinutes),
          locationSharingEnabled: settings.locationSharingEnabled,
        },
        { params: { restaurantId: membership.restaurantId } },
      );
      setSettings((current) => ({ ...current, ...response.data.settings }));
      setNotice("Delivery settings saved.");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };

  const setDeliveryAvailability = async (enabled) => {
    if (!branchId) return;
    setSavingAvailability(true);
    setError("");
    setNotice("");
    try {
      await api.patch(
        `/restaurant/branches/${branchId}/delivery-availability`,
        { deliveryEnabled: enabled },
        { params: { restaurantId: membership.restaurantId } },
      );
      setBranches((current) =>
        current.map((item) =>
          item.id === branchId ? { ...item, deliveryEnabled: enabled } : item,
        ),
      );
      setNotice(
        `Delivery service ${enabled ? "enabled" : "disabled"} for this branch.`,
      );
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSavingAvailability(false);
    }
  };

  const branch = branches.find((item) => item.id === branchId);
  const toggle = (key, title, description) => (
    <label
      key={key}
      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <input
        className="mt-1 size-4 accent-orange-500"
        type="checkbox"
        checked={Boolean(settings[key])}
        onChange={(event) => update(key, event.target.checked)}
      />
      <span>
        <span className="block text-sm font-bold text-slate-900">{title}</span>
        <span className="mt-1 block text-sm text-slate-500">{description}</span>
      </span>
    </label>
  );

  if (!membership)
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Restaurant owner access is required to manage delivery settings.
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-orange-600">
          Restaurant portal
        </p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">
          Delivery Settings
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Control assignment, workload and location sharing for the restaurant
          or an individual branch.
        </p>
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
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
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label
          htmlFor="delivery-branch"
          className="text-sm font-bold text-slate-800"
        >
          Settings scope
        </label>
        <select
          id="delivery-branch"
          className={fieldClass}
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
        >
          <option value="">Restaurant defaults</option>
          {branches.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-slate-500">
          Branch settings override restaurant defaults.
        </p>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <LoaderCircle className="animate-spin" size={18} />
          Loading settings…
        </div>
      ) : (
        <form onSubmit={save} className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Truck className="text-orange-500" size={20} />
              <h2 className="font-extrabold text-slate-900">
                Order assignment
              </h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {toggle(
                "manualAssignmentEnabled",
                "Allow manual assignment",
                "Authorized restaurant staff can assign and reassign delivery employees.",
              )}
              {toggle(
                "automaticAssignmentEnabled",
                "Enable automatic assignment",
                "New eligible delivery orders can be assigned to an online employee within the branch.",
              )}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Maximum active assignments per employee
                <input
                  className={fieldClass}
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={settings.maxActiveAssignments}
                  onChange={(event) =>
                    update("maxActiveAssignments", event.target.value)
                  }
                  required
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Acceptance timeout (minutes)
                <input
                  className={fieldClass}
                  type="number"
                  min="1"
                  max="120"
                  step="1"
                  value={settings.acceptanceTimeoutMinutes}
                  onChange={(event) =>
                    update("acceptanceTimeoutMinutes", event.target.value)
                  }
                  required
                />
              </label>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Settings2 className="text-orange-500" size={20} />
              <h2 className="font-extrabold text-slate-900">
                Availability and tracking
              </h2>
            </div>
            <div className="space-y-3">
              {toggle(
                "locationSharingEnabled",
                "Allow delivery location sharing",
                "Active delivery staff may share GPS with the assigned customer and authorized branch staff while on a delivery.",
              )}
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <Clock3 size={17} />
                Branch delivery service and hours
              </div>
              {branch ? (
                <>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p>
                      Delivery is{" "}
                      <strong>
                        {branch.deliveryEnabled ? "enabled" : "disabled"}
                      </strong>{" "}
                      at {branch.name}.
                    </p>
                    <button
                      type="button"
                      disabled={savingAvailability}
                      onClick={() =>
                        setDeliveryAvailability(!branch.deliveryEnabled)
                      }
                      className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:border-orange-300 disabled:opacity-50"
                    >
                      {savingAvailability
                        ? "Saving…"
                        : branch.deliveryEnabled
                          ? "Disable delivery"
                          : "Enable delivery"}
                    </button>
                  </div>
                  <p className="mt-2">
                    Operating hours: {branch.openingTime || "not set"}–
                    {branch.closingTime || "not set"} (
                    {branch.timeZone || "branch timezone"}). Manage hours in{" "}
                    <Link
                      className="font-bold text-orange-600 hover:underline"
                      to="/restaurant/business-settings"
                    >
                      Business settings
                    </Link>
                    .
                  </p>
                </>
              ) : (
                <p className="mt-2">
                  Choose a branch above to manage its delivery availability.
                  Operating hours remain managed in{" "}
                  <Link
                    className="font-bold text-orange-600 hover:underline"
                    to="/restaurant/business-settings"
                  >
                    Business settings
                  </Link>
                  .
                </p>
              )}
            </div>
          </section>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="mr-auto max-w-2xl text-xs text-slate-500">
              Preparation buffers, delivery charges and alternate
              proof-of-delivery methods are not configured in FoodieHub’s
              current pricing and confirmation flows, so they are not exposed
              here.
            </p>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
              type="submit"
              disabled={saving}
            >
              <Save size={17} />
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

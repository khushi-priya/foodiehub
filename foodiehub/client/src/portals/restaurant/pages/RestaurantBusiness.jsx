import { useCallback, useEffect, useState } from "react";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";
import { Store, Clock3, Power, ShieldAlert, RefreshCw } from "lucide-react";

const field =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
const action =
  "rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50";
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const msg = (e) =>
  e.response?.data?.message || "Unable to save changes. Please try again.";
const formatBranchTime = (value, timeZone) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZone || "Asia/Kolkata",
  }).format(new Date(value));
export default function RestaurantBusiness() {
  const { user } = useAuth();
  const memberships = user?.restaurantMemberships || [];
  const membership =
    memberships.find(
      (m) =>
        m.status === "active" &&
        (typeof m.role === "string" ? m.role : m.role?.code) ===
          "restaurant_owner",
    ) || memberships.find((m) => m.status === "active");
  const permissions = (membership?.role?.permissions || []).map((p) =>
    typeof p === "string" ? p : p.code,
  );
  const canUpdate = permissions.includes("business.update");
  const [restaurant, setRestaurant] = useState({});
  const [branches, setBranches] = useState([]);
  const [history, setHistory] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [profile, setProfile] = useState({});
  const [hours, setHours] = useState({});
  const [reason, setReason] = useState("Maintenance");
  const [reopenAt, setReopenAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/restaurant/business");
      setRestaurant(data.restaurant || {});
      setBranches(data.branches || []);
      setHistory(data.closureHistory || []);
      setProfile({
        name: data.restaurant?.name || "",
        email: data.restaurant?.email || "",
        phone: data.restaurant?.phone || "",
        description: data.restaurant?.description || "",
        logo: data.restaurant?.logo || "",
      });
      const selected =
        data.branches?.find((b) => b.id === branchId) || data.branches?.[0];
      if (selected) {
        setBranchId(selected.id);
        setHours({
          branchId: selected.id,
          openingTime: selected.openingTime?.slice(0, 5) || "",
          closingTime: selected.closingTime?.slice(0, 5) || "",
          workingDays: selected.workingDays || days,
          closedDays: selected.closedDays || [],
          overnight: !!selected.overnight,
          timeZone: selected.timeZone || "Asia/Kolkata",
        });
      }
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, [branchId]);
  useEffect(() => {
    load();
  }, [load]);
  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch("/restaurant/business/profile", profile);
      setRestaurant(data.restaurant);
      setNotice("Restaurant profile saved.");
    } catch (e) {
      setError(msg(e));
    } finally {
      setSaving(false);
    }
  };
  const saveHours = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/restaurant/business/hours", hours);
      setNotice("Branch hours updated.");
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setSaving(false);
    }
  };
  const toggleOrders = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch("/restaurant/business/orders", {
        acceptingOrders: !restaurant.acceptingOrders,
      });
      setRestaurant({ ...restaurant, acceptingOrders: data.acceptingOrders });
      setNotice(data.message);
    } catch (e) {
      setError(msg(e));
    } finally {
      setSaving(false);
    }
  };
  const closure = async (branch, close) => {
    setSaving(true);
    setError("");
    try {
      if (close)
        await api.post(`/restaurant/business/branches/${branch.id}/close`, {
          reason,
          reopenAt: reopenAt || null,
        });
      else
        await api.post(`/restaurant/business/branches/${branch.id}/reopen`, {});
      setNotice(
        close
          ? `${branch.name} is temporarily closed.`
          : `${branch.name} reopened.`,
      );
      await load();
    } catch (e) {
      setError(msg(e));
    } finally {
      setSaving(false);
    }
  };
  const changeBranch = (id) => {
    setBranchId(id);
    const b = branches.find((x) => x.id === id);
    if (b)
      setHours({
        branchId: b.id,
        openingTime: b.openingTime?.slice(0, 5) || "",
        closingTime: b.closingTime?.slice(0, 5) || "",
        workingDays: b.workingDays || days,
        closedDays: b.closedDays || [],
        overnight: !!b.overnight,
        timeZone: b.timeZone || "Asia/Kolkata",
      });
  };
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-orange-600">
          Business
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
          Restaurant profile & settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage public contact details, branch hours, order acceptance and
          closures.
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {notice}
          <button className="float-right" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </p>
      )}
      <section className="mb-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <form
          onSubmit={saveProfile}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
              <Store size={18} />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">Restaurant profile</h2>
              <p className="text-xs text-slate-500">
                Approval and subscription controls remain with Super Admin.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Restaurant name", "name"],
              ["Contact email", "email"],
              ["Contact phone", "phone"],
              ["Logo URL (HTTPS)", "logo"],
            ].map(([label, key]) => (
              <label key={key} className="text-xs font-semibold text-slate-600">
                {label}
                <input
                  disabled={!canUpdate}
                  type={key === "email" ? "email" : "text"}
                  value={profile[key] || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, [key]: e.target.value })
                  }
                  className={field}
                />
              </label>
            ))}
            <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
              Description
              <textarea
                disabled={!canUpdate}
                rows={4}
                maxLength={5000}
                value={profile.description || ""}
                onChange={(e) =>
                  setProfile({ ...profile, description: e.target.value })
                }
                className={field}
              />
            </label>
          </div>
          {canUpdate && (
            <button disabled={saving} className={`${action} mt-4`}>
              {saving ? "Saving…" : "Save profile"}
            </button>
          )}
        </form>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <Power size={18} />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">Online orders</h2>
              <p className="text-xs text-slate-500">
                Existing orders remain available if paused.
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-700">
            Current status:{" "}
            <strong
              className={
                restaurant.acceptingOrders
                  ? "text-emerald-700"
                  : "text-amber-700"
              }
            >
              {restaurant.acceptingOrders ? "Accepting new orders" : "Paused"}
            </strong>
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            The checkout API checks this setting, including QR ordering. Pausing
            does not modify existing order or payment records.
          </p>
          {canUpdate && (
            <button
              disabled={saving}
              onClick={toggleOrders}
              className={`${action} mt-5`}
            >
              {restaurant.acceptingOrders
                ? "Pause new orders"
                : "Resume new orders"}
            </button>
          )}
        </article>
      </section>
      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-xl bg-violet-50 p-2.5 text-violet-600">
            <Clock3 size={18} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Branch business hours</h2>
            <p className="text-xs text-slate-500">
              Hours use the existing branch schedule and timezone.
            </p>
          </div>
        </div>
        {branches.length === 0 ? (
          <p className="text-sm text-slate-500">
            Create a branch before setting business hours.
          </p>
        ) : (
          <>
            <label className="mb-4 block max-w-sm text-xs font-semibold text-slate-600">
              Branch
              <select
                value={branchId}
                onChange={(e) => changeBranch(e.target.value)}
                className={field}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <form onSubmit={saveHours}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-semibold text-slate-600">
                  Opening time
                  <input
                    required
                    type="time"
                    value={hours.openingTime || ""}
                    onChange={(e) =>
                      setHours({ ...hours, openingTime: e.target.value })
                    }
                    className={field}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Closing time
                  <input
                    required
                    type="time"
                    value={hours.closingTime || ""}
                    onChange={(e) =>
                      setHours({ ...hours, closingTime: e.target.value })
                    }
                    className={field}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Timezone
                  <input
                    required
                    value={hours.timeZone || ""}
                    onChange={(e) =>
                      setHours({ ...hours, timeZone: e.target.value })
                    }
                    className={field}
                  />
                </label>
                <label className="flex items-center gap-2 self-end rounded-xl border p-3 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={!!hours.overnight}
                    onChange={(e) =>
                      setHours({ ...hours, overnight: e.target.checked })
                    }
                  />
                  Overnight hours
                </label>
              </div>
              <fieldset className="mt-4">
                <legend className="text-xs font-semibold text-slate-600">
                  Open days
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {days.map((day) => (
                    <label
                      key={day}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={(hours.workingDays || []).includes(day)}
                        onChange={(e) =>
                          setHours({
                            ...hours,
                            workingDays: e.target.checked
                              ? [...hours.workingDays, day]
                              : hours.workingDays.filter((d) => d !== day),
                          })
                        }
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </fieldset>
              {canUpdate && (
                <button disabled={saving} className={`${action} mt-4`}>
                  Save hours
                </button>
              )}
            </form>
          </>
        )}
      </section>
      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
            <ShieldAlert size={18} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">
              Temporary branch closure
            </h2>
            <p className="text-xs text-slate-500">
              Closure blocks new orders for the selected branch and preserves
              existing orders.
            </p>
          </div>
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={field}
            >
              {[
                "Emergency closure",
                "Maintenance",
                "Staff unavailable",
                "Holiday",
                "Other",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Optional reopening date/time
            <input
              type="datetime-local"
              value={reopenAt}
              onChange={(e) => setReopenAt(e.target.value)}
              className={field}
            />
            <span className="mt-1 block text-[10px] text-slate-400">
              Uses the branch timezone. A later closure replaces this scheduled
              reopening.
            </span>
          </label>
        </div>
        <div className="space-y-2">
          {branches.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
            >
              <div>
                <p className="text-sm font-bold text-slate-800">{b.name}</p>
                <p className="text-xs text-slate-500">
                  {b.operationalStatus?.replaceAll("_", " ")} · {b.city}
                  {b.temporaryClosureUntil
                    ? ` · Reopens ${formatBranchTime(b.temporaryClosureUntil, b.timeZone)}`
                    : ""}
                </p>
              </div>
              {b.operationalStatus === "temporarily_closed"
                ? canUpdate && (
                    <button
                      disabled={saving}
                      onClick={() => closure(b, false)}
                      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"
                    >
                      <RefreshCw size={14} />
                      Reopen now
                    </button>
                  )
                : canUpdate && (
                    <button
                      disabled={saving}
                      onClick={() => closure(b, true)}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"
                    >
                      Close temporarily
                    </button>
                  )}
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold text-slate-900">Closure history</h2>
        {history.length ? (
          <div className="space-y-2">
            {history.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs"
              >
                <span className="font-semibold text-slate-700">
                  {branches.find((b) => b.id === row.entityId)?.name ||
                    "Branch"}{" "}
                  ·{" "}
                  {row.action.endsWith("reopened")
                    ? "Reopened"
                    : "Temporarily closed"}
                  {row.reason ? ` · ${row.reason}` : ""}
                </span>
                <time className="text-slate-500">
                  {new Date(row.createdAt).toLocaleString()}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No closure actions recorded.</p>
        )}
      </section>
      {loading && (
        <p className="mt-4 text-center text-xs text-slate-400">
          Loading business settings…
        </p>
      )}
    </main>
  );
}

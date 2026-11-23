import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  CalendarDays,
  Clock3,
  LoaderCircle,
  MapPin,
  Users,
  X,
} from "lucide-react";
import { api } from "../../../services/api";
import { useAuth, getUserRoles } from "../../../context/AuthContext";

const durations = [
  [60, "1 hour"],
  [90, "1 hour 30 minutes"],
  [120, "2 hours"],
  [150, "2 hours 30 minutes"],
  [180, "3 hours"],
  [240, "4 hours"],
  [300, "5 hours"],
  [360, "6 hours"],
];
const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
const errorMessage = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Reservation could not be created.";

function localDateTime(date, timeZone) {
  try {
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  } catch {
    return "";
  }
}

function profilePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits.slice(-10);
}

export default function CustomerReservationForm({
  restaurant: fixedRestaurant = null,
  initialBranchId = "",
  onClose,
  onCreated,
}) {
  const { user } = useAuth();
  const location = useLocation();
  const isCustomer = getUserRoles(user).includes("customer");
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantId, setRestaurantId] = useState(fixedRestaurant?.id || "");
  const selectedRestaurant =
    fixedRestaurant ||
    restaurants.find((item) => item.id === restaurantId) ||
    null;
  const [branches, setBranches] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(!fixedRestaurant);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState("");
  const [branchRetry, setBranchRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [minDateTime, setMinDateTime] = useState("");
  const [form, setForm] = useState({
    guestName: user
      ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
      : "",
    guestPhone: profilePhone(user?.phone),
    guestEmail: user?.email || "",
    branchId: initialBranchId,
    startsAt: "",
    partySize: 2,
    durationMinutes: 120,
    notes: "",
  });

  useEffect(() => {
    if (fixedRestaurant) {
      setRestaurantId(fixedRestaurant.id);
      return;
    }
    let active = true;
    setLoadingOptions(true);
    api
      .get("/public/restaurants", { params: { limit: 48 } })
      .then((response) => {
        if (active) setRestaurants(response.data.data.restaurants || []);
      })
      .catch((requestError) => {
        if (active) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, [fixedRestaurant]);

  useEffect(() => {
    if (!selectedRestaurant?.slug) {
      setBranches([]);
      setBranchError("");
      setBranchLoading(false);
      return undefined;
    }
    let active = true;
    setBranches([]);
    setBranchError("");
    setBranchLoading(true);
    setLoadingOptions(true);
    api
      .get(
        `/public/restaurants/${encodeURIComponent(selectedRestaurant.slug)}/branches`,
      )
      .then((response) => {
        if (!active) return;
        // The public API already filters inactive and suspended branches. It
        // intentionally does not expose those private operational fields.
        const responseBranches = Array.isArray(response.data?.data)
          ? response.data.data
          : [];
        const available = responseBranches.filter(
          (branch) =>
            branch.approvalStatus === "approved" &&
            branch.dineInEnabled === true,
        );
        setBranches(available);
        setForm((current) => ({
          ...current,
          branchId: available.some(
            (branch) => branch.id === (current.branchId || initialBranchId),
          )
            ? current.branchId || initialBranchId
            : available.find((branch) => branch.isPrimary)?.id ||
              available[0]?.id ||
              "",
          startsAt: "",
        }));
      })
      .catch((requestError) => {
        if (active) {
          setBranches([]);
          setForm((current) => ({ ...current, branchId: "", startsAt: "" }));
          setBranchError(errorMessage(requestError));
        }
      })
      .finally(() => {
        if (active) {
          setBranchLoading(false);
          setLoadingOptions(false);
        }
      });
    return () => {
      active = false;
    };
  }, [
    selectedRestaurant?.id,
    selectedRestaurant?.slug,
    initialBranchId,
    branchRetry,
  ]);

  useEffect(() => {
    if (!user) return;
    setForm((current) => ({
      ...current,
      guestName:
        current.guestName ||
        `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      guestPhone: current.guestPhone || profilePhone(user.phone),
      guestEmail: current.guestEmail || user.email || "",
    }));
  }, [user]);

  const branch = useMemo(
    () => branches.find((item) => item.id === form.branchId),
    [branches, form.branchId],
  );
  const timeZone = branch?.timeZone || "Asia/Kolkata";
  useEffect(() => {
    const timer = window.setTimeout(
      () => setMinDateTime(localDateTime(Date.now(), timeZone)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [timeZone]);

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const phone = String(form.guestPhone || "").replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setPhoneError("Enter exactly 10 digits, starting with 6–9.");
      return;
    }
    setPhoneError("");
    if (!selectedRestaurant || !branch) {
      setError("Choose a restaurant and an eligible dine-in branch.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(form.startsAt)) {
      setError("Choose a valid reservation date and time.");
      return;
    }
    setBusy(true);
    try {
      const response = await api.post("/customer/reservations", {
        restaurantId: selectedRestaurant.id,
        branchId: branch.id,
        guestName: String(form.guestName || "").trim(),
        guestPhone: phone,
        guestEmail: String(form.guestEmail || "").trim() || null,
        startsAt: form.startsAt,
        partySize: Number(form.partySize),
        durationMinutes: Number(form.durationMinutes),
        notes: String(form.notes || "").trim() || null,
      });
      onCreated?.(response.data.data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-reservation-title"
        className="my-auto max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600">
              Online table booking
            </p>
            <h2
              id="customer-reservation-title"
              className="mt-1 text-xl font-bold text-slate-900"
            >
              Book a table
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Send a request to the restaurant. The table is assigned when they
              confirm.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close reservation form"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
          >
            <X size={19} />
          </button>
        </header>
        {!isCustomer ? (
          <div className="p-6">
            <p className="text-sm text-slate-600">
              Sign in or create a customer account to request a reservation.
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                to="/customer/login"
                state={{
                  from: {
                    pathname: location.pathname,
                    search: location.search,
                  },
                }}
                className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white"
              >
                Sign in
              </Link>
              <Link
                to="/customer/register"
                state={{
                  from: {
                    pathname: location.pathname,
                    search: location.search,
                  },
                }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                Create account
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                Guest name *
                <input
                  required
                  maxLength={150}
                  value={form.guestName}
                  onChange={(event) => change("guestName", event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Indian mobile number *
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  pattern="[6-9][0-9]{9}"
                  maxLength={10}
                  value={form.guestPhone}
                  onChange={(event) => {
                    const value = event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 10);
                    change("guestPhone", value);
                    setPhoneError(
                      value && !/^[6-9]\d{9}$/.test(value)
                        ? "Enter exactly 10 digits, starting with 6–9."
                        : "",
                    );
                  }}
                  aria-invalid={Boolean(phoneError)}
                  className={`${inputClass} ${phoneError ? "border-red-400" : ""}`}
                />
                {phoneError && (
                  <span className="mt-1 block text-[11px] text-red-600">
                    {phoneError}
                  </span>
                )}
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Email address (optional)
                <input
                  type="email"
                  maxLength={150}
                  value={form.guestEmail}
                  onChange={(event) => change("guestEmail", event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Restaurant *
                {fixedRestaurant ? (
                  <div className={`${inputClass} flex items-center`}>
                    {fixedRestaurant.name}
                  </div>
                ) : (
                  <select
                    required
                    value={restaurantId}
                    onChange={(event) => {
                      setRestaurantId(event.target.value);
                      setBranches([]);
                      setBranchError("");
                      setBranchLoading(Boolean(event.target.value));
                      setLoadingOptions(Boolean(event.target.value));
                      setForm((current) => ({
                        ...current,
                        branchId: "",
                        startsAt: "",
                      }));
                    }}
                    className={inputClass}
                  >
                    <option value="">Choose restaurant</option>
                    {restaurants.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Branch *
                <span className="relative mt-1 block">
                  <MapPin
                    size={15}
                    className="absolute left-3 top-3 text-slate-400"
                  />
                  <select
                    required
                    disabled={
                      !selectedRestaurant || branchLoading || !branches.length
                    }
                    value={form.branchId}
                    onChange={(event) => change("branchId", event.target.value)}
                    className={`${inputClass} pl-9`}
                  >
                    <option value="">
                      {!selectedRestaurant
                        ? "Choose a restaurant first"
                        : branchLoading
                          ? "Loading branches…"
                          : "Choose branch"}
                    </option>
                    {branches.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.city}
                      </option>
                    ))}
                  </select>
                </span>
                {branchError ? (
                  <span
                    role="alert"
                    className="mt-1 flex items-center justify-between gap-2 text-[11px] font-normal text-rose-700"
                  >
                    <span>{branchError}</span>
                    <button
                      type="button"
                      onClick={() => setBranchRetry((value) => value + 1)}
                      className="shrink-0 font-bold underline"
                    >
                      Retry
                    </button>
                  </span>
                ) : selectedRestaurant && !branchLoading && !branches.length ? (
                  <span
                    role="status"
                    className="mt-1 block text-[11px] font-normal text-slate-500"
                  >
                    No eligible dine-in branches are available for this
                    restaurant.
                  </span>
                ) : null}
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Date and time *
                <span className="relative mt-1 block">
                  <CalendarDays
                    size={15}
                    className="absolute left-3 top-3 text-slate-400"
                  />
                  <input
                    required
                    type="datetime-local"
                    min={minDateTime || undefined}
                    value={form.startsAt}
                    onChange={(event) => change("startsAt", event.target.value)}
                    className={`${inputClass} pl-9`}
                  />
                </span>
                <span className="mt-1 block text-[11px] font-normal text-slate-400">
                  Branch local time · {timeZone}
                </span>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Number of guests *
                <span className="relative mt-1 block">
                  <Users
                    size={15}
                    className="absolute left-3 top-3 text-slate-400"
                  />
                  <input
                    required
                    type="number"
                    min="1"
                    max="100"
                    value={form.partySize}
                    onChange={(event) =>
                      change("partySize", event.target.value)
                    }
                    className={`${inputClass} pl-9`}
                  />
                </span>
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Duration *
                <span className="relative mt-1 block">
                  <Clock3
                    size={15}
                    className="absolute left-3 top-3 text-slate-400"
                  />
                  <select
                    required
                    value={form.durationMinutes}
                    onChange={(event) =>
                      change("durationMinutes", event.target.value)
                    }
                    className={`${inputClass} pl-9`}
                  >
                    {durations.map(([minutes, label]) => (
                      <option key={minutes} value={minutes}>
                        {label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Special requests / notes
                <textarea
                  maxLength={2000}
                  rows={3}
                  value={form.notes}
                  onChange={(event) => change("notes", event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </label>
            </div>
            <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  busy ||
                  loadingOptions ||
                  Boolean(phoneError) ||
                  !branches.length
                }
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy && <LoaderCircle size={16} className="animate-spin" />}
                {busy ? "Sending request…" : "Request reservation"}
              </button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}

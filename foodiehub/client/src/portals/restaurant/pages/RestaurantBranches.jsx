import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Eye,
  GitBranch,
  LoaderCircle,
  MapPin,
  Phone,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import { api } from "../../../services/api";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const blank = {
  name: "",
  branchCode: "",
  phone: "",
  email: "",
  addressLine: "",
  addressLine2: "",
  landmark: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  latitude: "",
  longitude: "",
  openingTime: "09:00",
  closingTime: "22:00",
  timeZone: "Asia/Kolkata",
  workingDays: [...DAYS],
  closedDays: [],
  overnight: false,
  dineInEnabled: true,
  takeawayEnabled: true,
  deliveryEnabled: true,
  cashOnDeliveryEnabled: false,
  razorpayEnabled: false,
  isPrimary: false,
  isActive: true,
};

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

const message = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Unable to complete the request.";

const formatTime = (time) => (time ? String(time).slice(0, 5) : "—");

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

function Field({ label, children, error }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      {children}
      {error && (
        <span className="mt-1 block text-xs font-medium text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6 ${
          wide ? "max-w-3xl" : "max-w-2xl"
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 className="border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
      {children}
    </h3>
  );
}

function BranchStatusBadges({ branch }) {
  const approval = branch.approvalStatus || "pending";
  const operational =
    !branch.isActive || branch.operationalStatus === "inactive"
      ? "Inactive"
      : branch.operationalStatus === "temporarily_closed"
        ? "Suspended"
        : "Active";
  const approvalLabels = {
    pending: ["Pending Approval", "bg-amber-50 text-amber-700"],
    approved: ["Approved", "bg-emerald-50 text-emerald-700"],
    rejected: ["Rejected", "bg-red-50 text-red-700"],
    suspended: ["Suspended", "bg-red-50 text-red-700"],
  };
  const [approvalLabel, approvalStyle] =
    approvalLabels[approval] || approvalLabels.pending;
  const availability = branch.availabilityStatus === "open" ? "Open" : "Closed";

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Branch status"
    >
      <span
        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${approvalStyle}`}
      >
        {approvalLabel}
      </span>
      <span
        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${operational === "Active" ? "bg-blue-50 text-blue-700" : operational === "Suspended" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}
      >
        {operational}
      </span>
      <span
        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${availability === "Open" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}
      >
        {availability}
      </span>
    </div>
  );
}

function BranchForm({ initial, onCancel, onSave, saving }) {
  const [form, setForm] = useState(() => {
    if (!initial || Object.keys(initial).length === 0) {
      return { ...blank, workingDays: [...DAYS], closedDays: [] };
    }
    const workingDays = Array.isArray(initial.workingDays)
      ? DAYS.filter((day) => initial.workingDays.includes(day))
      : Array.isArray(initial.closedDays)
        ? DAYS.filter((day) => !initial.closedDays.includes(day))
        : [...DAYS];
    const time = (value) => (value == null ? "" : String(value).slice(0, 5));
    return {
      ...blank,
      ...initial,
      name: String(initial.name ?? ""),
      branchCode: String(initial.branchCode ?? ""),
      phone: String(initial.phone ?? ""),
      email: String(initial.email ?? ""),
      addressLine: String(initial.addressLine ?? ""),
      addressLine2: String(initial.addressLine2 ?? ""),
      landmark: String(initial.landmark ?? ""),
      city: String(initial.city ?? ""),
      state: String(initial.state ?? ""),
      postalCode: String(initial.postalCode ?? ""),
      country: String(initial.country ?? ""),
      latitude: initial.latitude == null ? "" : String(initial.latitude),
      longitude: initial.longitude == null ? "" : String(initial.longitude),
      openingTime: time(initial.openingTime),
      closingTime: time(initial.closingTime),
      timeZone: String(initial.timeZone ?? "Asia/Kolkata"),
      workingDays,
      closedDays: DAYS.filter((day) => !workingDays.includes(day)),
      overnight: initial.overnight === true,
      dineInEnabled: initial.dineInEnabled ?? blank.dineInEnabled,
      takeawayEnabled: initial.takeawayEnabled ?? blank.takeawayEnabled,
      deliveryEnabled: initial.deliveryEnabled ?? blank.deliveryEnabled,
      cashOnDeliveryEnabled:
        initial.cashOnDeliveryEnabled ?? blank.cashOnDeliveryEnabled,
      razorpayEnabled: initial.razorpayEnabled ?? blank.razorpayEnabled,
      isPrimary: initial.isPrimary === true,
      isActive: initial.isActive ?? blank.isActive,
    };
  });

  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const toggleDay = (day) => {
    const days = form.workingDays.includes(day)
      ? form.workingDays.filter((value) => value !== day)
      : DAYS.filter(
          (value) => form.workingDays.includes(value) || value === day,
        );

    set("workingDays", days);
    set(
      "closedDays",
      DAYS.filter((value) => !days.includes(value)),
    );
  };

  async function submit(e) {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    const failField = (field, message) => {
      setFieldErrors({ [field]: message });
    };

    const required = [
      ["name", "Enter the branch name."],
      ["branchCode", "Enter the branch code."],
      ["addressLine", "Enter the branch address."],
      ["city", "Enter the city."],
      ["state", "Enter the state."],
      ["country", "Enter the country."],
    ];
    const missing = required.find(([key]) => !String(form[key] ?? "").trim());
    if (missing) return failField(missing[0], missing[1]);

    // Mobile number: Indian 10-digit mobile number.
    if (!/^[6-9]\d{9}$/.test(String(form.phone || "").trim())) {
      return failField(
        "phone",
        "Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.",
      );
    }

    // Indian PIN code: exactly 6 digits; first digit cannot be zero.
    if (!/^[1-9]\d{5}$/.test(String(form.postalCode || "").trim())) {
      return failField(
        "postalCode",
        "Enter a valid 6-digit Indian PIN code. The first digit cannot be zero.",
      );
    }

    const email = String(form.email ?? "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return failField("email", "Enter a valid email address.");
    }

    if (!Array.isArray(form.workingDays) || !form.workingDays.length) {
      return failField("workingDays", "Select at least one working day.");
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.openingTime || "")) {
      return failField("openingTime", "Enter a valid opening time.");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.closingTime || "")) {
      return failField("closingTime", "Enter a valid closing time.");
    }
    if (form.openingTime === form.closingTime) {
      return failField(
        "closingTime",
        "Opening and closing times must be different.",
      );
    }
    if (form.closingTime < form.openingTime && !form.overnight) {
      return failField(
        "overnight",
        "Enable overnight hours when closing time is earlier than opening time.",
      );
    }
    if (form.closingTime > form.openingTime && form.overnight) {
      return failField(
        "overnight",
        "Overnight hours require closing time to be earlier than opening time.",
      );
    }

    const timeZone = String(form.timeZone ?? "").trim();
    try {
      if (!timeZone) throw new Error("missing time zone");
      new Intl.DateTimeFormat("en-US", { timeZone });
    } catch {
      return failField(
        "timeZone",
        "Enter a valid IANA time zone, such as Asia/Kolkata.",
      );
    }

    if ((form.latitude === "") !== (form.longitude === "")) {
      return failField(
        "coordinates",
        "Provide both latitude and longitude, or leave both blank.",
      );
    }

    if (form.latitude !== "" && form.longitude !== "") {
      const latitude = Number(form.latitude);
      const longitude = Number(form.longitude);

      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        return failField(
          "coordinates",
          "Enter a valid latitude between -90 and 90.",
        );
      }

      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return failField(
          "coordinates",
          "Enter a valid longitude between -180 and 180.",
        );
      }
    }

    if (!form.dineInEnabled && !form.takeawayEnabled && !form.deliveryEnabled) {
      return failField("services", "Enable at least one service.");
    }

    try {
      await onSave({
        ...form,
        name: String(form.name ?? "").trim(),
        branchCode: String(form.branchCode ?? "")
          .trim()
          .toUpperCase(),
        phone: String(form.phone ?? "").trim(),
        email: email || null,
        addressLine: String(form.addressLine ?? "").trim(),
        addressLine2: String(form.addressLine2 ?? "").trim() || null,
        landmark: String(form.landmark ?? "").trim() || null,
        city: String(form.city ?? "").trim(),
        state: String(form.state ?? "").trim(),
        postalCode: String(form.postalCode ?? "").trim(),
        country: String(form.country ?? "").trim(),
        timeZone,
        closedDays: DAYS.filter((day) => !form.workingDays.includes(day)),
        latitude: form.latitude === "" ? null : Number(form.latitude),
        longitude: form.longitude === "" ? null : Number(form.longitude),
      });
    } catch (err) {
      setError(message(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <SectionTitle>Basic information</SectionTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Branch name *" error={fieldErrors.name}>
          <input
            className={inputClass}
            maxLength={150}
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>

        <Field label="Branch code *" error={fieldErrors.branchCode}>
          <input
            className={inputClass}
            maxLength={50}
            required
            value={form.branchCode}
            onChange={(e) =>
              set(
                "branchCode",
                e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
              )
            }
          />
        </Field>

        <Field label="Contact number *" error={fieldErrors.phone}>
          <input
            className={inputClass}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="Enter 10-digit mobile number"
            pattern="[6-9][0-9]{9}"
            title="Enter a valid 10-digit mobile number starting with 6, 7, 8 or 9"
            maxLength={10}
            minLength={10}
            required
            value={form.phone || ""}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, "").slice(0, 10);
              set("phone", value);
            }}
          />
          <span className="mt-1 block text-[11px] font-normal text-slate-400">
            Enter exactly 10 digits. Must start with 6, 7, 8 or 9.
          </span>
        </Field>

        <Field label="Branch email (optional)" error={fieldErrors.email}>
          <input
            className={inputClass}
            type="email"
            maxLength={150}
            value={form.email || ""}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
      </div>

      <SectionTitle>Address</SectionTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address line 1 *" error={fieldErrors.addressLine}>
          <input
            className={inputClass}
            maxLength={255}
            required
            value={form.addressLine}
            onChange={(e) => set("addressLine", e.target.value)}
          />
        </Field>

        <Field label="Address line 2">
          <input
            className={inputClass}
            maxLength={255}
            value={form.addressLine2 || ""}
            onChange={(e) => set("addressLine2", e.target.value)}
          />
        </Field>

        <Field label="Landmark">
          <input
            className={inputClass}
            maxLength={150}
            value={form.landmark || ""}
            onChange={(e) => set("landmark", e.target.value)}
          />
        </Field>

        <Field label="City *" error={fieldErrors.city}>
          <input
            className={inputClass}
            maxLength={100}
            required
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
          />
        </Field>

        <Field label="State *" error={fieldErrors.state}>
          <input
            className={inputClass}
            maxLength={100}
            required
            value={form.state}
            onChange={(e) => set("state", e.target.value)}
          />
        </Field>

        <Field label="Postal code *" error={fieldErrors.postalCode}>
          <input
            className={inputClass}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="Enter 6-digit PIN code"
            pattern="[1-9][0-9]{5}"
            title="Enter a valid 6-digit Indian PIN code"
            maxLength={6}
            minLength={6}
            required
            value={form.postalCode || ""}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, "").slice(0, 6);
              set("postalCode", value);
            }}
          />
          <span className="mt-1 block text-[11px] font-normal text-slate-400">
            Enter exactly 6 digits. The first digit cannot be zero.
          </span>
        </Field>

        <Field label="Country *" error={fieldErrors.country}>
          <input
            className={inputClass}
            maxLength={100}
            required
            value={form.country}
            onChange={(e) => set("country", e.target.value)}
          />
        </Field>
      </div>

      <SectionTitle>Location</SectionTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Latitude">
          <input
            className={inputClass}
            type="number"
            min="-90"
            max="90"
            step="any"
            required={form.longitude !== ""}
            value={form.latitude ?? ""}
            onChange={(e) => set("latitude", e.target.value)}
          />
        </Field>

        <Field label="Longitude">
          <input
            className={inputClass}
            type="number"
            min="-180"
            max="180"
            step="any"
            required={form.latitude !== ""}
            value={form.longitude ?? ""}
            onChange={(e) => set("longitude", e.target.value)}
          />
        </Field>
      </div>

      <SectionTitle>Operating information</SectionTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Opening time *" error={fieldErrors.openingTime}>
          <input
            className={inputClass}
            type="time"
            required
            value={form.openingTime}
            onChange={(e) => set("openingTime", e.target.value)}
          />
        </Field>

        <Field label="Closing time *" error={fieldErrors.closingTime}>
          <input
            className={inputClass}
            type="time"
            required
            value={form.closingTime}
            onChange={(e) => set("closingTime", e.target.value)}
          />
        </Field>

        <Field label="Time zone (IANA)" error={fieldErrors.timeZone}>
          <input
            className={inputClass}
            maxLength={64}
            required
            value={form.timeZone ?? ""}
            placeholder="Asia/Kolkata"
            onChange={(e) => set("timeZone", e.target.value)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={form.overnight}
          onChange={(e) => set("overnight", e.target.checked)}
        />
        This branch operates overnight
      </label>
      {fieldErrors.overnight && (
        <p className="text-xs font-medium text-red-600">
          {fieldErrors.overnight}
        </p>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-600">
          Working days
        </p>

        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <label
              key={day}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${
                form.workingDays.includes(day)
                  ? "border-orange-300 bg-orange-50 text-orange-700"
                  : "border-slate-200 text-slate-500"
              }`}
            >
              <input
                className="sr-only"
                type="checkbox"
                checked={form.workingDays.includes(day)}
                onChange={() => toggleDay(day)}
              />
              {day.slice(0, 3)}
            </label>
          ))}
        </div>

        <p className="mt-2 text-xs text-slate-400">
          Closed days:{" "}
          {DAYS.filter((day) => !form.workingDays.includes(day)).join(", ") ||
            "None"}
        </p>
        {fieldErrors.workingDays && (
          <p className="mt-1 text-xs font-medium text-red-600">
            {fieldErrors.workingDays}
          </p>
        )}
      </div>

      <SectionTitle>Services and branch settings</SectionTitle>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
        {[
          ["dineInEnabled", "Dine-in"],
          ["takeawayEnabled", "Takeaway"],
          ["deliveryEnabled", "Delivery"],
          ["cashOnDeliveryEnabled", "Accept cash on delivery"],
          ["razorpayEnabled", "Accept Razorpay online payments"],
        ].map(([key, title]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!form[key]}
              onChange={(e) => set(key, e.target.checked)}
            />
            {title}
          </label>
        ))}
      </div>
      {fieldErrors.services && (
        <p className="text-xs font-medium text-red-600">
          {fieldErrors.services}
        </p>
      )}
      {fieldErrors.coordinates && (
        <p className="text-xs font-medium text-red-600">
          {fieldErrors.coordinates}
        </p>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={(e) => set("isPrimary", e.target.checked)}
          />
          Set as primary branch
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
          />
          Branch active
        </label>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-slate-600"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save branch"}
        </button>
      </div>
    </form>
  );
}

function BranchDetails({ branch }) {
  const services = [
    ["Dine-in", branch.dineInEnabled],
    ["Takeaway", branch.takeawayEnabled],
    ["Delivery", branch.deliveryEnabled],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <BranchStatusBadges branch={branch} />

        {branch.isPrimary && (
          <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-700">
            <Star size={12} className="fill-current" />
            PRIMARY
          </span>
        )}

        <span className="text-sm text-slate-500">{branch.branchCode}</span>
      </div>

      {branch.approvalStatus === "rejected" && branch.rejectionReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-red-700">
            Rejection reason
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-red-800">
            {branch.rejectionReason}
          </p>
          <p className="mt-2 text-xs text-red-700">
            Edit and save this branch to resubmit it for Super Admin approval.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-4">
          <SectionTitle>Contact information</SectionTitle>
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <Phone size={15} />
            {branch.phone}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {branch.email || "No email provided"}
          </p>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          <SectionTitle>Address</SectionTitle>
          <p className="mt-3 flex gap-2 text-sm leading-6 text-slate-700">
            <MapPin size={16} className="mt-1 shrink-0" />
            <span>
              {[
                branch.addressLine,
                branch.addressLine2,
                branch.landmark,
                branch.city,
                branch.state,
                branch.postalCode,
                branch.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </span>
          </p>

          {branch.latitude != null && (
            <p className="mt-2 text-xs text-slate-400">
              Coordinates: {branch.latitude}, {branch.longitude}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 p-4">
        <SectionTitle>Operating hours</SectionTitle>
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <Clock3 size={16} />
          {formatTime(branch.openingTime)} – {formatTime(branch.closingTime)}
          {branch.overnight ? " (overnight)" : ""}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Time zone: {branch.timeZone || "Asia/Kolkata"}
        </p>
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <CalendarDays size={16} />
          {(branch.workingDays || []).join(", ") || "No working days set"}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Closed: {(branch.closedDays || []).join(", ") || "None"}
        </p>
      </div>

      <div className="rounded-xl bg-slate-50 p-4">
        <SectionTitle>Available services</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          {services.map(([label, enabled]) => (
            <span
              key={label}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                enabled
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {enabled ? "✓" : "–"} {label}
            </span>
          ))}

          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              branch.cashOnDeliveryEnabled
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-200 text-slate-500"
            }`}
          >
            {branch.cashOnDeliveryEnabled ? "Enabled" : "Disabled"} · Cash on
            delivery
          </span>

          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              branch.razorpayEnabled
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-200 text-slate-500"
            }`}
          >
            {branch.razorpayEnabled ? "Enabled" : "Disabled"} · Razorpay online
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Created {formatDate(branch.createdAt)}
      </p>
    </div>
  );
}

function Stat({ title, value, icon: Icon, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-800">
            {value ?? "—"}
          </p>
        </div>
        <span className={`rounded-xl p-3 ${tone}`}>
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

export default function RestaurantBranches() {
  const [summary, setSummary] = useState(null);
  const [branches, setBranches] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || "");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formBranch, setFormBranch] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = { page, limit: 10, status };

      if (search.trim()) params.search = search.trim();

      const [s, list] = await Promise.all([
        api.get("/restaurant/branches/summary"),
        api.get("/restaurant/branches", { params }),
      ]);

      setSummary(s.data.data);
      setBranches(list.data.data.branches);
      setPagination(list.data.data.pagination);
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveBranch(data) {
    setSaving(true);

    try {
      if (formBranch?.id) {
        await api.put(`/restaurant/branches/${formBranch.id}`, data);
      } else {
        await api.post("/restaurant/branches", data);
      }

      setNotice(
        formBranch?.approvalStatus === "rejected"
          ? "Branch updated and resubmitted for Super Admin approval."
          : formBranch?.id
            ? "Branch updated."
            : "Branch created and submitted for Super Admin approval.",
      );
      setFormBranch(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function openDetails(branch) {
    setDetailsLoading(true);
    setDetails(branch);

    try {
      const result = await api.get(`/restaurant/branches/${branch.id}`);
      setDetails(result.data.data);
    } catch (err) {
      setError(message(err));
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function setPrimary(branch) {
    try {
      await api.patch(`/restaurant/branches/${branch.id}/primary`);
      setNotice(`${branch.name} is now the primary branch.`);
      await load();

      if (details?.id === branch.id) {
        setDetails((prev) => ({ ...prev, isPrimary: true }));
      }
    } catch (err) {
      setError(message(err));
    }
  }

  async function toggleActive(branch) {
    const next = !branch.isActive;

    if (
      !next &&
      !window.confirm(
        `Deactivate ${branch.name}? Operational records will be retained.`,
      )
    ) {
      return;
    }

    try {
      await api.patch(`/restaurant/branches/${branch.id}/status`, {
        isActive: next,
      });

      setNotice(`${branch.name} ${next ? "activated" : "deactivated"}.`);
      await load();
    } catch (err) {
      setError(message(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-400">
            Workspace / Restaurant Management
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            Branches
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage your restaurant locations and services.
          </p>
        </div>

        <button
          onClick={() => setFormBranch({})}
          className="flex items-center justify-center gap-2 self-start rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
        >
          <Plus size={17} />
          Add New Branch
        </button>
      </div>

      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="flex items-center gap-2">
            <Check size={17} />
            {notice}
          </span>
          <button onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          title="Total Branches"
          value={summary?.totalBranches}
          icon={GitBranch}
          tone="bg-orange-50 text-orange-600"
        />
        <Stat
          title="Active Branches"
          value={summary?.activeBranches}
          icon={Check}
          tone="bg-emerald-50 text-emerald-600"
        />
        <Stat
          title="Inactive Branches"
          value={summary?.inactiveBranches}
          icon={Clock3}
          tone="bg-amber-50 text-amber-600"
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Primary Branch</p>
          <p className="mt-2 truncate text-lg font-bold text-slate-800">
            {summary?.primaryBranch?.name || "Not set"}
          </p>
          <p className="mt-1 truncate text-xs text-slate-400">
            {summary?.primaryBranch
              ? `${summary.primaryBranch.city}${
                  summary.primaryBranch.isActive ? "" : " · Inactive"
                }`
              : "Choose an active primary branch"}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-orange-400"
              placeholder="Search by branch name or city…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>

          <select
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-800">Branch locations</h2>
            <p className="mt-1 text-xs text-slate-400">
              {pagination.total} locations · codes are unique within your
              restaurant
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <LoaderCircle className="animate-spin text-orange-500" />
          </div>
        ) : branches.length ? (
          <div className="divide-y divide-slate-100">
            {branches.map((branch) => (
              <article
                key={branch.id}
                className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                  <Building2 size={21} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-800">{branch.name}</h3>

                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {branch.branchCode}
                    </span>

                    {branch.isPrimary && (
                      <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[9px] font-bold text-orange-700">
                        <Star size={11} className="fill-current" />
                        PRIMARY
                      </span>
                    )}

                    <BranchStatusBadges branch={branch} />
                  </div>

                  <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-500">
                    <MapPin size={14} />
                    {[
                      branch.addressLine,
                      branch.city,
                      branch.state,
                      branch.postalCode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>

                  <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Phone size={12} />
                      {branch.phone}
                    </span>
                    <span>{formatDate(branch.createdAt)}</span>
                    <span>
                      {formatTime(branch.openingTime)}–
                      {formatTime(branch.closingTime)}
                      {branch.overnight ? " +1" : ""}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => openDetails(branch)}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Eye size={14} />
                    Details
                  </button>

                  <button
                    onClick={() => setFormBranch(branch)}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Edit3 size={14} />
                    {branch.approvalStatus === "rejected"
                      ? "Edit & resubmit"
                      : "Edit"}
                  </button>

                  {branch.isActive && !branch.isPrimary && (
                    <button
                      onClick={() => setPrimary(branch)}
                      className="rounded-lg border px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                    >
                      Set primary
                    </button>
                  )}

                  <button
                    onClick={() => toggleActive(branch)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                      branch.isActive
                        ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    {branch.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
                {branch.approvalStatus === "rejected" &&
                  branch.rejectionReason && (
                    <p className="basis-full rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 lg:ml-16">
                      <span className="font-semibold">Rejected:</span>{" "}
                      {branch.rejectionReason}
                    </p>
                  )}
              </article>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <GitBranch className="mx-auto text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">
              {search || status !== "all"
                ? "No matching branches"
                : "No branches yet"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Add your first location to start managing multiple branches.
            </p>
          </div>
        )}

        {!!pagination.totalPages && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-lg border p-2 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>

              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-lg border p-2 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>

      {formBranch && (
        <Modal
          title={formBranch.id ? "Edit branch" : "Add branch"}
          wide
          onClose={() => setFormBranch(null)}
        >
          <BranchForm
            initial={formBranch.id ? formBranch : null}
            saving={saving}
            onCancel={() => setFormBranch(null)}
            onSave={saveBranch}
          />
        </Modal>
      )}

      {details && (
        <Modal
          title={detailsLoading ? "Loading branch…" : details.name}
          onClose={() => setDetails(null)}
        >
          {detailsLoading ? (
            <div className="flex justify-center py-10">
              <LoaderCircle className="animate-spin text-orange-500" />
            </div>
          ) : (
            <BranchDetails branch={details} />
          )}
        </Modal>
      )}
    </div>
  );
}

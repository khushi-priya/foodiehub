import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  LoaderCircle,
  Plus,
  Search,
  Truck,
  UserRound,
  X,
} from "lucide-react";

const input =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50";
const DELIVERY_ROLES = new Set([
  "delivery_associate",
  "senior_delivery_associate",
  "delivery_supervisor",
]);
const errorText = (error) =>
  error.response?.data?.message || "Something went wrong. Please try again.";

function roleCode(member) {
  return typeof member?.role === "string" ? member.role : member?.role?.code;
}

export default function RestaurantDeliveryStaff() {
  const { user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [filters, setFilters] = useState({
    search: "",
    roleId: "",
    branchId: "",
    status: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [editor, setEditor] = useState(null);
  const [profile, setProfile] = useState(null);

  const membership = useMemo(
    () =>
      (user?.restaurantMemberships || []).find(
        (item) =>
          item.status === "active" && roleCode(item) === "restaurant_owner",
      ),
    [user],
  );
  const permissions = (membership?.role?.permissions || []).map((item) =>
    typeof item === "string" ? item : item.code,
  );
  const canCreate =
    permissions.includes("employees.create") &&
    permissions.includes("employees.manage_roles");
  const canEdit = permissions.includes("employees.update");
  const canManageRoles = permissions.includes("employees.manage_roles");

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError("");
      try {
        const [staffResponse, rolesResponse, branchesResponse] =
          await Promise.all([
            api.get("/restaurant/team/delivery/staff", {
              params: { page, pageSize: 20, ...filters },
            }),
            api.get("/restaurant/team/delivery/roles"),
            api.get("/restaurant/branches"),
          ]);
        setStaff(staffResponse.data.employees || []);
        setPagination(
          staffResponse.data.pagination || { page: 1, totalPages: 1, total: 0 },
        );
        setRoles(
          (rolesResponse.data.roles || []).filter((role) =>
            DELIVERY_ROLES.has(role.code),
          ),
        );
        setBranches(
          branchesResponse.data.data?.branches ||
            branchesResponse.data.branches ||
            [],
        );
      } catch (requestError) {
        setError(errorText(requestError));
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) load(1);
    });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    if (!editor && !profile) return undefined;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !saving) {
        setEditor(null);
        setProfile(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [editor, profile, saving]);

  const startCreate = () =>
    setEditor({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      employeeId: "",
      roleId: "",
      branchIds: [],
    });
  const startEdit = (employee) =>
    setEditor({
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName || "",
      email: employee.email,
      phone: employee.phone || "",
      employeeId: employee.employeeId || "",
      roleId: employee.role.id,
      branchIds: employee.branches.map((branch) => branch.id),
      status: employee.status,
    });

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = { ...editor, employeeId: editor.employeeId.trim() || null };
      if (editor.id) {
        if (
          editor.status !== "active" &&
          !window.confirm(
            "Deactivate this delivery employee’s restaurant access? They will lose access immediately.",
          )
        ) {
          setSaving(false);
          return;
        }
        await api.patch(`/restaurant/team/delivery/staff/${editor.id}`, body);
        setNotice("Delivery staff details updated.");
        setInviteUrl("");
      } else {
        const response = await api.post(
          "/restaurant/team/delivery/staff",
          body,
        );
        setNotice(
          response.data.message || "Delivery staff invitation created.",
        );
        setInviteUrl(response.data.inviteUrl || "");
      }
      setEditor(null);
      await load(1);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };

  const change = (key, value) =>
    setEditor((current) => ({ ...current, [key]: value }));
  const toggleBranch = (branchId) =>
    setEditor((current) => ({
      ...current,
      branchIds: current.branchIds.includes(branchId)
        ? current.branchIds.filter((id) => id !== branchId)
        : [...current.branchIds, branchId],
    }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-orange-600">
            Delivery Management
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
            Delivery Staff
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Invite and manage delivery employees for your restaurant and
            branches.
          </p>
        </div>
        {canCreate && (
          <button type="button" className={button} onClick={startCreate}>
            <Plus size={16} />
            Add delivery staff
          </button>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
          <button
            type="button"
            onClick={() => setError("")}
            className="float-right font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
          {inviteUrl && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a className="break-all underline" href={inviteUrl}>
                {inviteUrl}
              </a>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(inviteUrl)}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1"
              >
                <Copy size={13} />
                Copy invite
              </button>
              <span className="text-xs">
                One-time invitation. Expires in 72 hours.
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setNotice("");
              setInviteUrl("");
            }}
            className="float-right font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative">
            <span className="sr-only">Search delivery staff</span>
            <Search
              size={15}
              className="absolute left-3 top-4 text-slate-400"
            />
            <input
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="Search name, email, phone or ID"
              className={`${input} pl-9`}
            />
          </label>
          <select
            aria-label="Filter by delivery role"
            value={filters.roleId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                roleId: event.target.value,
              }))
            }
            className={input}
          >
            <option value="">All delivery roles</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by branch"
            value={filters.branchId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                branchId: event.target.value,
              }))
            }
            className={input}
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by account status"
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value,
              }))
            }
            className={input}
          >
            <option value="">All account statuses</option>
            {["active", "invited", "inactive", "suspended"].map((status) => (
              <option key={status} value={status}>
                {status[0].toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <LoaderCircle size={18} className="animate-spin" />
              Loading delivery staff…
            </div>
          ) : staff.length ? (
            staff.map((employee) => (
              <article
                key={employee.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                    <UserRound size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">
                      {employee.fullName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {employee.email}
                      {employee.phone ? ` · ${employee.phone}` : ""}
                      {employee.employeeId ? ` · ${employee.employeeId}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {employee.role.name} ·{" "}
                      {employee.branches
                        .map((branch) => branch.name)
                        .join(", ") || "No branch assigned"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${employee.status === "active" ? "bg-emerald-50 text-emerald-700" : employee.status === "invited" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {employee.status}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${employee.availabilityStatus === "available" ? "bg-emerald-50 text-emerald-700" : employee.availabilityStatus === "on_delivery" ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {employee.availabilityStatus === "on_delivery"
                      ? "On delivery"
                      : employee.availabilityStatus === "available"
                        ? "Online"
                        : "Offline"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setProfile(employee)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Eye size={14} />
                    Profile
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => startEdit(employee)}
                      className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="py-12 text-center">
              <Truck size={28} className="mx-auto text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">
                No delivery staff found
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Try another filter or invite your first delivery employee.
              </p>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>
            {pagination.total} staff records · page {pagination.page} of{" "}
            {Math.max(1, pagination.totalPages)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous page"
              disabled={pagination.page <= 1 || loading}
              onClick={() => load(pagination.page - 1)}
              className="rounded-lg border p-2 disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => load(pagination.page + 1)}
              className="rounded-lg border p-2 disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </footer>
      </section>

      {editor && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setEditor(null);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-staff-form-title"
            onSubmit={save}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
                  Delivery Staff
                </p>
                <h2
                  id="delivery-staff-form-title"
                  className="mt-1 text-xl font-extrabold text-slate-900"
                >
                  {editor.id ? "Edit employee" : "Invite employee"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Account setup uses FoodieHub’s existing one-time invitation
                  process.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close form"
                onClick={() => setEditor(null)}
                className="rounded-lg border p-2 text-slate-600"
              >
                <X size={17} />
              </button>
            </header>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                First name
                <input
                  required
                  maxLength={100}
                  value={editor.firstName}
                  onChange={(event) => change("firstName", event.target.value)}
                  className={input}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Last name
                <input
                  maxLength={100}
                  value={editor.lastName}
                  onChange={(event) => change("lastName", event.target.value)}
                  className={input}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Email
                <input
                  required
                  type="email"
                  maxLength={150}
                  disabled={Boolean(editor.id)}
                  value={editor.email}
                  onChange={(event) => change("email", event.target.value)}
                  className={input}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Mobile number
                <input
                  type="tel"
                  maxLength={20}
                  value={editor.phone}
                  onChange={(event) => change("phone", event.target.value)}
                  className={input}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Employee ID
                <input
                  maxLength={40}
                  value={editor.employeeId}
                  onChange={(event) => change("employeeId", event.target.value)}
                  className={input}
                  placeholder="Optional"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Delivery role
                <select
                  required
                  value={editor.roleId}
                  onChange={(event) => change("roleId", event.target.value)}
                  className={input}
                >
                  <option value="">Select a role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="sm:col-span-2">
                <legend className="text-xs font-semibold text-slate-600">
                  Assigned branches
                </legend>
                {branches.length ? (
                  <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
                    {branches.map((branch) => (
                      <label
                        key={branch.id}
                        className="flex min-h-10 items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={editor.branchIds.includes(branch.id)}
                          onChange={() => toggleBranch(branch.id)}
                          className="h-4 w-4 accent-orange-500"
                        />
                        {branch.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                    Create a restaurant branch before assigning delivery staff.
                  </p>
                )}
              </fieldset>
              {editor.id && (
                <label className="text-xs font-semibold text-slate-600">
                  Account status
                  <select
                    value={editor.status}
                    onChange={(event) => change("status", event.target.value)}
                    className={input}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>
              )}
            </div>
            <footer className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button disabled={saving || !canManageRoles} className={button}>
                {saving && <LoaderCircle size={15} className="animate-spin" />}
                {saving
                  ? "Saving…"
                  : editor.id
                    ? "Save changes"
                    : "Create invitation"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {profile && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProfile(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-staff-profile-title"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
          >
            <header className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
                  Delivery Staff Profile
                </p>
                <h2
                  id="delivery-staff-profile-title"
                  className="mt-1 text-xl font-extrabold text-slate-900"
                >
                  {profile.fullName}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close profile"
                onClick={() => setProfile(null)}
                className="rounded-lg border p-2"
              >
                <X size={17} />
              </button>
            </header>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Email", profile.email],
                ["Mobile", profile.phone || "Not provided"],
                ["Employee ID", profile.employeeId || "Not assigned"],
                ["Delivery role", profile.role.name],
                ["Account status", profile.status],
                [
                  "Availability",
                  profile.availabilityStatus === "available"
                    ? "Online"
                    : profile.availabilityStatus === "on_delivery"
                      ? "On delivery"
                      : "Offline",
                ],
                [
                  "Joining date",
                  profile.joinedAt
                    ? new Date(profile.joinedAt).toLocaleDateString()
                    : "Invitation not accepted",
                ],
                [
                  "Assigned branches",
                  profile.branches.map((branch) => branch.name).join(", ") ||
                    "No branch assigned",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-1 break-words text-sm font-medium text-slate-800">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">
                Current assignment and delivery history
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Assignment history will appear when delivery assignment records
                are introduced in a later phase.
              </p>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

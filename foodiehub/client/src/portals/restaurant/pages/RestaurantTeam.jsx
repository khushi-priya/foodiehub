import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";
import {
  UserPlus,
  ShieldCheck,
  Search,
  Check,
  Copy,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
} from "lucide-react";

const input =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
const button =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50";
const errorText = (e) =>
  e.response?.data?.message || "Something went wrong. Please try again.";
const localInput = (value) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

export default function RestaurantTeam() {
  const location = useLocation();
  const { user } = useAuth();
  const section = location.pathname.split("/").pop();
  const tab =
    section === "roles"
      ? "roles"
      : section === "attendance"
        ? "attendance"
        : "employees";
  const membership =
    (user?.restaurantMemberships || []).find(
      (m) =>
        m.status === "active" &&
        (typeof m.role === "string" ? m.role : m.role?.code) ===
          "restaurant_owner",
    ) || (user?.restaurantMemberships || []).find((m) => m.status === "active");
  const permissionCodes = (membership?.role?.permissions || []).map((p) =>
    typeof p === "string" ? p : p.code,
  );
  const canManageRoles = permissionCodes.includes("employees.manage_roles");
  const canCreateEmployee =
    permissionCodes.includes("employees.create") && canManageRoles;
  const canUpdateEmployee = permissionCodes.includes("employees.update");
  const canCheckIn = permissionCodes.includes("attendance.check_in");
  const canCheckOut = permissionCodes.includes("attendance.check_out");
  const canViewAttendance = permissionCodes.includes("attendance.view");
  const canManageAttendance = permissionCodes.includes("attendance.manage");
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [branches, setBranches] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editor, setEditor] = useState(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [attendance, setAttendance] = useState([]);
  const [current, setCurrent] = useState(null);
  const [attendanceBranch, setAttendanceBranch] = useState("");
  const [roleEditor, setRoleEditor] = useState(null);
  const [attendanceEditor, setAttendanceEditor] = useState(null);
  const [attendanceEmployee, setAttendanceEmployee] = useState("");
  const [attendanceHistoryBranch, setAttendanceHistoryBranch] = useState("");
  const [attendanceFrom, setAttendanceFrom] = useState("");
  const [attendanceTo, setAttendanceTo] = useState("");
  const [modalDirty, setModalDirty] = useState(false);
  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError("");
      try {
        if (tab === "employees") {
          const [e, r, b, p] = await Promise.all([
            api.get("/restaurant/team/employees", {
              params: {
                page,
                pageSize: 20,
                search: search || undefined,
                roleId: roleFilter || undefined,
                branchId: branchFilter || undefined,
                status: statusFilter || undefined,
              },
            }),
            api.get("/restaurant/team/roles"),
            api.get("/restaurant/branches"),
            api.get("/restaurant/team/permissions"),
          ]);
          setEmployees(e.data.employees || []);
          setCounts(e.data.counts || {});
          setPagination(
            e.data.pagination || { page: 1, totalPages: 1, total: 0 },
          );
          setRoles(r.data.roles || []);
          setPermissions(p.data.permissions || []);
          setBranches(b.data.data?.branches || b.data.branches || []);
        }
        if (tab === "roles") {
          const [r, p] = await Promise.all([
            api.get("/restaurant/team/roles"),
            api.get("/restaurant/team/permissions"),
          ]);
          setRoles(r.data.roles || []);
          setPermissions(p.data.permissions || []);
        }
        if (tab === "attendance") {
          const me = await api.get("/auth/me");
          const allMemberships = me.data.user?.restaurantMemberships || [];
          const membership =
            allMemberships.find(
              (m) =>
                m.status === "active" &&
                (typeof m.role === "string" ? m.role : m.role?.code) ===
                  "restaurant_owner",
            ) || allMemberships.find((m) => m.status === "active");
          const codes = (membership?.role?.permissions || []).map((p) =>
            typeof p === "string" ? p : p.code,
          );
          const hasView = codes.includes("attendance.view");
          const canCheck = codes.includes("attendance.check_in");
          const [a, c, b] = await Promise.all([
            hasView
              ? api.get("/restaurant/team/attendance", {
                  params: {
                    employeeId: attendanceEmployee || undefined,
                    branchId: attendanceHistoryBranch || undefined,
                    from: attendanceFrom || undefined,
                    to: attendanceTo || undefined,
                  },
                })
              : Promise.resolve({ data: { attendance: [] } }),
            canCheck
              ? api.get("/restaurant/team/attendance/me")
              : Promise.resolve({ data: { current: null } }),
            hasView || canCheck
              ? api.get("/restaurant/team/attendance/branches")
              : Promise.resolve({ data: { branches: [] } }),
          ]);
          setAttendance(a.data.attendance || []);
          setCurrent(c.data.current || null);
          setBranches(b.data.branches || []);
          if (!attendanceBranch && b.data.branches?.[0])
            setAttendanceBranch(b.data.branches[0].id);
        }
      } catch (e) {
        setError(errorText(e));
      } finally {
        setLoading(false);
      }
    },
    [
      tab,
      search,
      roleFilter,
      branchFilter,
      statusFilter,
      attendanceBranch,
      attendanceEmployee,
      attendanceHistoryBranch,
      attendanceFrom,
      attendanceTo,
    ],
  );
  useEffect(() => {
    load(1);
  }, [load]);
  const groupedPermissions = useMemo(
    () =>
      permissions.reduce((acc, p) => {
        (acc[p.module] ||= []).push(p);
        return acc;
      }, {}),
    [permissions],
  );
  const editEmployee = (employee = null) => {
    setModalDirty(false);
    setEditor(
      employee
        ? {
            ...employee,
            roleId: employee.role.id,
            branchIds: employee.branches.map((b) => b.id),
          }
        : {
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            roleId: "",
            branchIds: [],
            status: "active",
          },
    );
  };
  const editRole = (role = null) => {
    if (!canManageRoles) return;
    setModalDirty(false);
    if (role) {
      const codes = role.permissions.map((p) => p.code);
      setRoleEditor({
        id: role.id,
        name: role.name,
        description: role.description || "",
        permissions: codes,
        originalPermissions: codes,
        originalName: role.name,
        originalDescription: role.description || "",
      });
    } else
      setRoleEditor({
        name: "",
        description: "",
        permissions: [],
        originalPermissions: [],
      });
  };
  const closeModal = useCallback(() => {
    if (saving) return;
    if (modalDirty && !window.confirm("Discard your unsaved changes?")) return;
    setEditor(null);
    setRoleEditor(null);
    setModalDirty(false);
  }, [modalDirty, saving]);
  useEffect(() => {
    if (!editor && !roleEditor) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editor, roleEditor, closeModal]);
  const saveEmployee = async (e) => {
    e.preventDefault();
    if (
      editor.id &&
      editor.status !== "active" &&
      !window.confirm(
        "Deactivate this employee’s restaurant access? They will lose access immediately.",
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      if (editor.id) {
        await api.patch(`/restaurant/team/employees/${editor.id}`, editor);
        setNotice("Employee updated.");
      } else {
        const { data } = await api.post("/restaurant/team/employees", editor);
        setNotice(data.message);
        setInviteUrl(data.inviteUrl || "");
      }
      setEditor(null);
      setModalDirty(false);
      await load(1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };
  const saveRole = async (e) => {
    e.preventDefault();
    if (!canManageRoles) {
      setError("You do not have permission to manage restaurant roles.");
      return;
    }
    if (roleEditor.name.trim().length < 2) {
      setError("Role name must be at least 2 characters.");
      return;
    }
    const sensitive = [
      "employees.manage_roles",
      "employees.deactivate",
      "payments.refund",
      "orders.cancel",
      "business.update",
      "branches.manage",
    ];
    if (
      sensitive.some(
        (code) =>
          (roleEditor.originalPermissions || []).includes(code) !==
          roleEditor.permissions.includes(code),
      ) &&
      !window.confirm(
        "This change grants sensitive restaurant permissions. Save these role permissions?",
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      if (roleEditor.id)
        await api.put(`/restaurant/team/roles/${roleEditor.id}`, roleEditor);
      else await api.post("/restaurant/team/roles", roleEditor);
      setNotice(
        roleEditor.id ? "Role permissions saved." : "Custom role created.",
      );
      await load(1);
      setRoleEditor(null);
      setModalDirty(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };
  const checkIn = async () => {
    try {
      await api.post("/restaurant/team/attendance/check-in", {
        branchId: attendanceBranch,
      });
      setNotice("Checked in.");
      await load(1);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const checkOut = async () => {
    try {
      await api.post("/restaurant/team/attendance/check-out", {});
      setNotice("Checked out.");
      await load(1);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const saveAttendance = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/restaurant/team/attendance/${attendanceEditor.id}`, {
        checkedInAt: new Date(attendanceEditor.checkedInAt).toISOString(),
        checkedOutAt: attendanceEditor.checkedOutAt
          ? new Date(attendanceEditor.checkedOutAt).toISOString()
          : null,
        checkInNote: attendanceEditor.checkInNote,
        checkOutNote: attendanceEditor.checkOutNote,
      });
      setAttendanceEditor(null);
      setNotice("Attendance correction saved.");
      await load(1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-orange-600">
            Teams
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
            {tab === "employees"
              ? "Employees"
              : tab === "roles"
                ? "Roles & permissions"
                : "Attendance"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {tab === "employees"
              ? "Manage your restaurant team, roles and access."
              : "Manage restaurant attendance and team access."}
          </p>
        </div>
        {tab === "employees" && (
          <div className="flex flex-wrap gap-2">
            {canManageRoles && (
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-bold text-orange-700 hover:bg-orange-50"
                onClick={() => editRole()}
              >
                <Plus size={16} />
                Create Role
              </button>
            )}
            {canCreateEmployee && (
              <button
                type="button"
                className={button}
                onClick={() => editEmployee()}
              >
                <UserPlus size={16} />
                Add Employee
              </button>
            )}
          </div>
        )}
        {tab === "roles" && canManageRoles && (
          <button type="button" className={button} onClick={() => editRole()}>
            <Plus size={16} />
            Create Role
          </button>
        )}
      </header>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
          <button className="float-right" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {notice}
          {inviteUrl && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a className="underline" href={inviteUrl}>
                {inviteUrl}
              </a>
              <button
                onClick={() => navigator.clipboard?.writeText(inviteUrl)}
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"
              >
                <Copy size={13} />
                Copy link
              </button>
              <span className="text-xs">
                Share this one-time invitation securely. Expires in 72 hours.
              </span>
            </div>
          )}
          <button
            className="float-right"
            onClick={() => {
              setNotice("");
              setInviteUrl("");
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {tab === "employees" && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Total", counts.total],
              ["Active", counts.active],
              ["Inactive", counts.inactive],
              ["Invited", counts.invited],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <p className="text-xs font-semibold text-slate-500">
                  {label} employees
                </p>
                <p className="mt-1 text-2xl font-extrabold text-slate-900">
                  {value || 0}
                </p>
              </div>
            ))}
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-4">
              <label className="relative md:col-span-1">
                <Search
                  size={15}
                  className="absolute left-3 top-4 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search employees"
                  className={`${input} pl-9`}
                />
              </label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className={input}
              >
                <option value="">All roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className={input}
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={input}
              >
                <option value="">All statuses</option>
                {["active", "invited", "inactive", "suspended"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    {[
                      "Employee",
                      "Role",
                      "Branches",
                      "Status",
                      "Last login",
                      "Joined",
                      canUpdateEmployee ? "" : "",
                    ].map((x) => (
                      <th key={x} className="p-3">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map((e) => (
                    <tr key={e.id}>
                      <td className="p-3">
                        <p className="font-bold text-slate-800">{e.fullName}</p>
                        <p className="text-xs text-slate-500">
                          {e.email}
                          {e.phone ? ` · ${e.phone}` : ""}
                        </p>
                      </td>
                      <td className="p-3">{e.role.name}</td>
                      <td className="p-3">
                        {e.branches.map((b) => b.name).join(", ") ||
                          "No branch"}
                      </td>
                      <td className="p-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize">
                          {e.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs">
                        {e.lastLoginAt
                          ? new Date(e.lastLoginAt).toLocaleString()
                          : "Never"}
                      </td>
                      <td className="p-3 text-xs">
                        {e.joinedAt
                          ? new Date(e.joinedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="p-3">
                        {canUpdateEmployee && (
                          <button
                            onClick={() => editEmployee(e)}
                            className="rounded-lg border px-3 py-1.5 text-xs font-bold"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !employees.length && (
                <p className="p-10 text-center text-sm text-slate-500">
                  No employees match these filters.
                </p>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>{pagination.total || 0} employees</span>
              <div className="flex gap-2">
                <button
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => load(pagination.page - 1)}
                  className="rounded-lg border p-2 disabled:opacity-40"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="px-2 py-2">
                  Page {pagination.page || 1} of {pagination.totalPages || 1}
                </span>
                <button
                  disabled={pagination.page >= pagination.totalPages || loading}
                  onClick={() => load(pagination.page + 1)}
                  className="rounded-lg border p-2 disabled:opacity-40"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </section>
        </>
      )}
      {tab === "employees" && canManageRoles && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <h2 className="font-bold text-slate-900">Restaurant roles</h2>
            <p className="text-xs text-slate-500">
              System roles are protected. Edit custom role access here.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => (
              <article
                key={role.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {role.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {role.isSystem ? "System role" : "Custom role"}
                  </p>
                </div>
                {!role.isSystem && (
                  <button
                    type="button"
                    onClick={() => editRole(role)}
                    className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold"
                  >
                    Edit
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      {tab === "roles" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Restaurant roles</h2>
              <p className="text-xs text-slate-500">
                System roles are protected. Add custom roles for tailored
                access.
              </p>
            </div>
            {canManageRoles && (
              <button className={button} onClick={() => editRole()}>
                <ShieldCheck size={16} />
                Create role
              </button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {roles.map((role) => (
              <article
                key={role.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800">{role.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {role.memberCount || 0} members ·{" "}
                      {role.isSystem ? "System role" : "Custom role"}
                    </p>
                  </div>
                  {canManageRoles && !role.isSystem && (
                    <button
                      onClick={() => editRole(role)}
                      className="rounded-lg border px-3 py-1.5 text-xs font-bold"
                    >
                      Edit permissions
                    </button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(role.permissions || []).map((p) => (
                    <span
                      key={p.code}
                      className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600"
                    >
                      {p.code}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          {!roles.length && !loading && (
            <p className="p-8 text-center text-sm text-slate-500">
              No roles were returned.
            </p>
          )}
        </section>
      )}
      {tab === "attendance" && (
        <>
          <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <h2 className="font-bold text-slate-900">My shift</h2>
              <p className="text-xs text-slate-500">
                Timestamps are recorded by the server.
              </p>
              {current && (
                <p className="mt-2 text-sm text-emerald-700">
                  Checked in at {new Date(current.checkedInAt).toLocaleString()}{" "}
                  · {current.branch?.name}
                </p>
              )}
            </div>
            {canCheckIn && (
              <div className="flex flex-wrap gap-2">
                <select
                  value={attendanceBranch}
                  onChange={(e) => setAttendanceBranch(e.target.value)}
                  className={`${input} min-w-48`}
                  disabled={!!current}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {current && canCheckOut ? (
                  <button
                    onClick={checkOut}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
                  >
                    Check out
                  </button>
                ) : (
                  !current && (
                    <button
                      onClick={checkIn}
                      disabled={!attendanceBranch}
                      className={button}
                    >
                      <Check size={15} />
                      Check in
                    </button>
                  )
                )}
              </div>
            )}
          </section>
          {canViewAttendance ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 font-bold text-slate-900">
                Attendance history
              </h2>
              <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <select
                  value={attendanceEmployee}
                  onChange={(e) => setAttendanceEmployee(e.target.value)}
                  className={input}
                >
                  <option value="">All employees</option>
                  {[
                    ...new Map(
                      attendance.map((a) => [
                        a.restaurantMemberId,
                        {
                          id: a.restaurantMemberId,
                          name: `${a.restaurantMember?.user?.firstName || ""} ${a.restaurantMember?.user?.lastName || ""}`.trim(),
                        },
                      ]),
                    ).values(),
                  ].map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                <select
                  value={attendanceHistoryBranch}
                  onChange={(e) => setAttendanceHistoryBranch(e.target.value)}
                  className={input}
                >
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <label className="text-[10px] font-semibold text-slate-500">
                  From
                  <input
                    type="date"
                    value={attendanceFrom}
                    onChange={(e) => setAttendanceFrom(e.target.value)}
                    className={input}
                  />
                </label>
                <label className="text-[10px] font-semibold text-slate-500">
                  To
                  <input
                    type="date"
                    value={attendanceTo}
                    onChange={(e) => setAttendanceTo(e.target.value)}
                    className={input}
                  />
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                    <tr>
                      {[
                        "Employee",
                        "Branch",
                        "Check in",
                        "Check out",
                        "Duration",
                        ...(canManageAttendance ? [""] : []),
                      ].map((x) => (
                        <th key={x} className="p-3">
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendance.map((a) => (
                      <tr key={a.id}>
                        <td className="p-3">
                          {a.restaurantMember?.user?.firstName}{" "}
                          {a.restaurantMember?.user?.lastName || ""}
                        </td>
                        <td className="p-3">{a.branch?.name}</td>
                        <td className="p-3">
                          {new Date(a.checkedInAt).toLocaleString()}
                        </td>
                        <td className="p-3">
                          {a.checkedOutAt
                            ? new Date(a.checkedOutAt).toLocaleString()
                            : "Active"}
                        </td>
                        <td className="p-3">
                          {a.checkedOutAt
                            ? `${Math.round((new Date(a.checkedOutAt) - new Date(a.checkedInAt)) / 60000)} min`
                            : "—"}
                        </td>
                        {canManageAttendance && (
                          <td className="p-3">
                            <button
                              className="rounded-lg border px-2 py-1 text-xs font-bold"
                              onClick={() =>
                                setAttendanceEditor({
                                  id: a.id,
                                  checkedInAt: localInput(a.checkedInAt),
                                  checkedOutAt: a.checkedOutAt
                                    ? localInput(a.checkedOutAt)
                                    : "",
                                  checkInNote: a.checkInNote || "",
                                  checkOutNote: a.checkOutNote || "",
                                })
                              }
                            >
                              Correct
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!attendance.length && !loading && (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No attendance records for this filter.
                  </p>
                )}
              </div>
            </section>
          ) : (
            <p className="text-sm text-slate-500">
              You can manage your own shift here. Attendance history is
              restricted by your current role.
            </p>
          )}
        </>
      )}
      {loading && (
        <div className="fixed bottom-5 right-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          <LoaderCircle className="animate-spin" size={16} />
          Loading team data…
        </div>
      )}
      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={saveEmployee}
            onChangeCapture={() => setModalDirty(true)}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-extrabold">
                {editor.id ? "Edit employee" : "Add Employee"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close employee dialog"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              New employees receive a one-time setup invitation. No password is
              created or exposed.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["First name", "firstName"],
                ["Last name", "lastName"],
                ["Email", "email"],
                ["Phone", "phone"],
              ].map(([label, key]) => (
                <label
                  key={key}
                  className="text-xs font-semibold text-slate-600"
                >
                  {label}
                  <input
                    required={key === "firstName" || key === "email"}
                    type={key === "email" ? "email" : "text"}
                    value={editor[key] || ""}
                    onChange={(e) =>
                      setEditor({ ...editor, [key]: e.target.value })
                    }
                    className={input}
                  />
                </label>
              ))}
              <label className="text-xs font-semibold text-slate-600">
                Role
                <select
                  required
                  value={editor.roleId}
                  onChange={(e) =>
                    setEditor({ ...editor, roleId: e.target.value })
                  }
                  className={input}
                >
                  <option value="">Select role</option>
                  {roles
                    .filter((r) => r.code !== "restaurant_owner")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Account status
                <select
                  value={editor.status}
                  onChange={(e) =>
                    setEditor({ ...editor, status: e.target.value })
                  }
                  className={input}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
              <fieldset className="sm:col-span-2">
                <legend className="text-xs font-semibold text-slate-600">
                  Branch assignments
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {branches.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={editor.branchIds.includes(b.id)}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            branchIds: e.target.checked
                              ? [...editor.branchIds, b.id]
                              : editor.branchIds.filter((id) => id !== b.id),
                          })
                        }
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border px-4 py-2.5 text-sm font-bold"
              >
                Cancel
              </button>
              <button disabled={saving} className={button}>
                {saving
                  ? "Saving…"
                  : editor.id
                    ? "Save changes"
                    : "Send invitation"}
              </button>
            </div>
          </form>
        </div>
      )}
      {roleEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={saveRole}
            onChangeCapture={() => setModalDirty(true)}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-extrabold">
                  {roleEditor.id ? "Edit custom role" : "Create Custom Role"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Choose the actions this role can perform across your
                  restaurant.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close create role dialog"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={18} />
              </button>
            </div>
            <label className="mt-4 block text-xs font-semibold text-slate-600">
              Role name
              <input
                required
                maxLength={100}
                value={roleEditor.name}
                onChange={(e) =>
                  setRoleEditor({ ...roleEditor, name: e.target.value })
                }
                className={input}
              />
            </label>
            <label className="mt-3 block text-xs font-semibold text-slate-600">
              Description
              <input
                maxLength={1000}
                value={roleEditor.description}
                onChange={(e) =>
                  setRoleEditor({ ...roleEditor, description: e.target.value })
                }
                className={input}
              />
            </label>
            <div className="mt-4 space-y-3">
              {Object.entries(groupedPermissions).map(([module, items]) => (
                <fieldset
                  key={module}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <legend className="px-1 text-sm font-bold capitalize text-slate-800">
                    {module}
                    <button
                      type="button"
                      className="ml-3 text-[10px] font-semibold text-orange-600"
                      onClick={() => {
                        setModalDirty(true);
                        setRoleEditor({
                          ...roleEditor,
                          permissions: [
                            ...new Set([
                              ...roleEditor.permissions,
                              ...items.map((i) => i.code),
                            ]),
                          ],
                        });
                      }}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="ml-2 text-[10px] font-semibold text-slate-500"
                      onClick={() => {
                        setModalDirty(true);
                        setRoleEditor({
                          ...roleEditor,
                          permissions: roleEditor.permissions.filter(
                            (code) => !items.some((i) => i.code === code),
                          ),
                        });
                      }}
                    >
                      Clear
                    </button>
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={roleEditor.permissions.includes(p.code)}
                          onChange={(e) =>
                            setRoleEditor({
                              ...roleEditor,
                              permissions: e.target.checked
                                ? [...roleEditor.permissions, p.code]
                                : roleEditor.permissions.filter(
                                    (c) => c !== p.code,
                                  ),
                            })
                          }
                        />
                        <span>
                          <strong>{p.code}</strong>
                          <span className="block text-slate-500">
                            {p.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border px-4 py-2.5 text-sm font-bold"
              >
                Cancel
              </button>
              <button disabled={saving} className={button}>
                {saving
                  ? "Saving…"
                  : roleEditor.id
                    ? "Save role"
                    : "Create Role"}
              </button>
            </div>
          </form>
        </div>
      )}
      {attendanceEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={saveAttendance}
            className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2 className="text-xl font-extrabold">Correct attendance</h2>
            <p className="mt-1 text-xs text-slate-500">
              Changes are preserved in the audit log.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                Check-in
                <input
                  required
                  type="datetime-local"
                  value={attendanceEditor.checkedInAt}
                  onChange={(e) =>
                    setAttendanceEditor({
                      ...attendanceEditor,
                      checkedInAt: e.target.value,
                    })
                  }
                  className={input}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Check-out (optional)
                <input
                  type="datetime-local"
                  value={attendanceEditor.checkedOutAt}
                  onChange={(e) =>
                    setAttendanceEditor({
                      ...attendanceEditor,
                      checkedOutAt: e.target.value,
                    })
                  }
                  className={input}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Check-in note
                <input
                  maxLength={500}
                  value={attendanceEditor.checkInNote}
                  onChange={(e) =>
                    setAttendanceEditor({
                      ...attendanceEditor,
                      checkInNote: e.target.value,
                    })
                  }
                  className={input}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Check-out note
                <input
                  maxLength={500}
                  value={attendanceEditor.checkOutNote}
                  onChange={(e) =>
                    setAttendanceEditor({
                      ...attendanceEditor,
                      checkOutNote: e.target.value,
                    })
                  }
                  className={input}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAttendanceEditor(null)}
                className="rounded-xl border px-4 py-2.5 text-sm font-bold"
              >
                Cancel
              </button>
              <button disabled={saving} className={button}>
                {saving ? "Saving…" : "Save correction"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

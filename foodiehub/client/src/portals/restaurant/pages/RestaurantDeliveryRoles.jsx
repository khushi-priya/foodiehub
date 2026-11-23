import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";
import { LoaderCircle, Plus, ShieldCheck, X } from "lucide-react";

const input =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50";
const groups = [
  ["delivery_orders", "Delivery Orders"],
  ["delivery_staff", "Delivery Staff"],
  ["delivery_assignments", "Delivery Assignments"],
  ["delivery_tracking", "Live Tracking"],
  ["delivery_reports", "Delivery Reports"],
  ["delivery_settings", "Delivery Settings"],
];
const errorText = (error) =>
  error.response?.data?.message || "Something went wrong. Please try again.";

export default function RestaurantDeliveryRoles() {
  const { user } = useAuth();
  const membership = useMemo(
    () =>
      (user?.restaurantMemberships || []).find(
        (item) =>
          item.status === "active" &&
          (typeof item.role === "string" ? item.role : item.role?.code) ===
            "restaurant_owner",
      ),
    [user],
  );
  const permissions = (membership?.role?.permissions || []).map((item) =>
    typeof item === "string" ? item : item.code,
  );
  const canManageRoles = permissions.includes("employees.manage_roles");
  const [roles, setRoles] = useState([]);
  const [permissionList, setPermissionList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [roleResponse, permissionResponse] = await Promise.all([
        api.get("/restaurant/team/delivery/roles"),
        api.get("/restaurant/team/delivery/permissions"),
      ]);
      setRoles(roleResponse.data.roles || []);
      setPermissionList(permissionResponse.data.permissions || []);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const grouped = useMemo(
    () =>
      permissionList.reduce((result, permission) => {
        (result[permission.module] ||= []).push(permission);
        return result;
      }, {}),
    [permissionList],
  );

  const editRole = (role = null) =>
    setEditor(
      role
        ? {
            id: role.id,
            name: role.name,
            description: role.description || "",
            permissions: (role.permissions || []).map((permission) =>
              typeof permission === "string" ? permission : permission.code,
            ),
          }
        : { name: "", description: "", permissions: [] },
    );

  const togglePermission = (code) =>
    setEditor((current) => ({
      ...current,
      permissions: current.permissions.includes(code)
        ? current.permissions.filter((item) => item !== code)
        : [...current.permissions, code],
    }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editor.id)
        await api.patch(`/restaurant/team/delivery/roles/${editor.id}`, editor);
      else await api.post("/restaurant/team/delivery/roles", editor);
      setNotice(
        editor.id ? "Delivery role updated." : "Custom delivery role created.",
      );
      setEditor(null);
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-orange-600">
            Delivery Management
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
            Delivery Roles & Permissions
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Delivery roles use the shared restaurant role system. Each role
            receives only the delivery permissions selected for it.
          </p>
        </div>
        {canManageRoles && (
          <button type="button" onClick={() => editRole()} className={button}>
            <Plus size={16} />
            Create custom role
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
          <button
            type="button"
            onClick={() => setNotice("")}
            className="float-right font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-14 text-sm text-slate-500">
          <LoaderCircle size={18} className="animate-spin" />
          Loading delivery roles…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((role) => (
            <article
              key={role.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <header className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <ShieldCheck size={19} />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900">{role.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {role.isSystem ? "Default delivery role" : "Custom role"}{" "}
                      · {role.memberCount || 0} staff
                    </p>
                  </div>
                </div>
                {canManageRoles && !role.isSystem && (
                  <button
                    type="button"
                    onClick={() => editRole(role)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                )}
              </header>
              <p className="mt-3 text-sm text-slate-600">
                {role.description || "No description provided."}
              </p>
              <div className="mt-4 space-y-3">
                {groups.map(([module, title]) => {
                  const codes = new Set(
                    (role.permissions || []).map((permission) =>
                      typeof permission === "string"
                        ? permission
                        : permission.code,
                    ),
                  );
                  const enabled = (grouped[module] || []).filter((permission) =>
                    codes.has(permission.code),
                  );
                  return enabled.length ? (
                    <section key={module}>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {title}
                      </h3>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {enabled.map((permission) => (
                          <span
                            key={permission.code}
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-700"
                          >
                            {permission.code
                              .replace(`${module}.`, "")
                              .replaceAll("_", " ")}
                          </span>
                        ))}
                      </div>
                    </section>
                  ) : null;
                })}
              </div>
            </article>
          ))}
          {roles.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 lg:col-span-2">
              No delivery roles are configured. Apply the delivery permissions
              migration to load the default roles.
            </p>
          )}
        </div>
      )}

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
            aria-labelledby="delivery-role-form-title"
            onSubmit={save}
            className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
                  Delivery Role
                </p>
                <h2
                  id="delivery-role-form-title"
                  className="mt-1 text-xl font-extrabold text-slate-900"
                >
                  {editor.id ? "Edit custom role" : "Create custom role"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Only these delivery permissions will be added to the role.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close form"
                onClick={() => setEditor(null)}
                className="rounded-lg border p-2"
              >
                <X size={17} />
              </button>
            </header>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                Role name
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={editor.name}
                  onChange={(event) =>
                    setEditor((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={input}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Description
                <input
                  maxLength={1000}
                  value={editor.description}
                  onChange={(event) =>
                    setEditor((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className={input}
                />
              </label>
            </div>
            <div className="mt-5 space-y-4">
              {groups.map(([module, title]) => (
                <fieldset
                  key={module}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <legend className="px-1 text-sm font-bold text-slate-800">
                    {title}
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(grouped[module] || []).map((permission) => (
                      <label
                        key={permission.code}
                        className="flex min-h-10 items-start gap-2 rounded-lg p-2 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={editor.permissions.includes(permission.code)}
                          onChange={() => togglePermission(permission.code)}
                          className="mt-0.5 h-4 w-4 accent-orange-500"
                        />
                        <span>
                          <span className="font-semibold">
                            {permission.code
                              .replace(`${module}.`, "")
                              .replaceAll("_", " ")}
                          </span>
                          <span className="mt-0.5 block text-slate-500">
                            {permission.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
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
                {saving ? "Saving…" : editor.id ? "Save role" : "Create role"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}

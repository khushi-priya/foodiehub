import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, getUserRoles } from "../../../context/AuthContext";
import { api } from "../../../services/api";

export default function CustomerRegister() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.from
    ? `${location.state.from.pathname || '/customer/dashboard'}${location.state.from.search || ''}${location.state.from.hash || ''}`
    : '/customer/dashboard';
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (user)
      navigate(
        getUserRoles(user).includes("customer")
          ? returnTo
          : "/unauthorized",
        { replace: true },
      );
  }, [user, navigate, returnTo]);
  function change(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/customer/register", form);
      const account = await login(
        form.email.trim().toLowerCase(),
        form.password,
      );
      if (!getUserRoles(account).includes("customer"))
        throw new Error("Customer account role could not be verified.");
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to create account.",
      );
    } finally {
      setBusy(false);
    }
  }
  const fields = [
    ["firstName", "First name", "text"],
    ["lastName", "Last name", "text"],
    ["email", "Email", "email"],
    ["phone", "Mobile number", "tel"],
    ["password", "Password", "password"],
    ["confirmPassword", "Confirm password", "password"],
  ];
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] p-5">
      <form
        onSubmit={submit}
        className="w-full max-w-lg space-y-4 rounded-3xl border border-orange-100 bg-white p-8 shadow-xl"
      >
        <Link to="/" className="text-xl font-extrabold">
          Foodie<span className="text-orange-500">Hub</span>
        </Link>
        <div>
          <h1 className="mt-4 text-3xl font-bold">Create your account</h1>
          <p className="mt-2 text-sm text-slate-500">
            Join FoodieHub to explore local restaurants.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(([name, label, type]) => (
            <label key={name} className="block text-sm font-medium">
              {label}
              <input
                required={name !== "phone"}
                type={type}
                name={name}
                autoComplete={name === "password" ? "new-password" : name}
                value={form[name]}
                onChange={change}
                className="mt-1 w-full rounded-xl border p-3"
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          Password: 8–20 characters with uppercase, lowercase, number and
          special character.
        </p>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="w-full rounded-xl bg-orange-500 p-3 font-bold text-white disabled:opacity-60"
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="text-center text-sm text-slate-500">
          Already registered?{" "}
          <Link className="font-bold text-orange-600" to="/customer/login" state={location.state}>
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}

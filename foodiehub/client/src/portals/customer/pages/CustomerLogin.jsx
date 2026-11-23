import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, getUserRoles, homePath } from "../../../context/AuthContext";

export default function CustomerLogin() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const returnTo = location.state?.from
    ? `${location.state.from.pathname || '/customer/dashboard'}${location.state.from.search || ''}${location.state.from.hash || ''}`
    : '/customer/dashboard';
  useEffect(() => {
    if (user)
      navigate(
        getUserRoles(user).includes("customer")
          ? returnTo
          : homePath(user),
        { replace: true },
      );
  }, [user, navigate, returnTo]);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const account = await login(email.trim(), password);
      if (!getUserRoles(account).includes("customer")) {
        setError(
          "This login is for customer accounts. Use the correct portal for your account.",
        );
        return;
      }
      navigate(returnTo, { replace: true });
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] p-5">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-3xl border border-orange-100 bg-white p-8 shadow-xl"
      >
        <Link to={user ? homePath(user) : "/"} className="text-xl font-extrabold">
          Foodie<span className="text-orange-500">Hub</span>
        </Link>
        <div>
          <h1 className="mt-5 text-3xl font-bold">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to your customer account.
          </p>
        </div>
        <label className="block text-sm font-medium">
          Email
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border p-3"
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border p-3"
          />
        </label>
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
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-sm text-slate-500">
          New to FoodieHub?{" "}
          <Link className="font-bold text-orange-600" to="/customer/register" state={location.state}>
            Create account
          </Link>
        </p>
        <Link to="/login" className="block text-center text-xs text-slate-400">
          Choose another account type
        </Link>
      </form>
    </main>
  );
}

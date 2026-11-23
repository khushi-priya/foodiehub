
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import {
  ChefHat,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ArrowRight,
  ShieldCheck,
  Store,
  UserPlus,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

import { useAuth } from '../../../context/AuthContext';

export default function RestaurantLogin() {
  const navigate = useNavigate();
  const location = useLocation();

  const { login, logout } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const registrationMessage = location.state?.registrationMessage;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    try {
      setLoading(true);

      // Authenticate using existing backend session.
      const authenticatedUser = await login(
        email.trim().toLowerCase(),
        password,
        { portal: 'restaurant' }
      );

      const hasRestaurantMembership = authenticatedUser?.restaurantMemberships
        ?.some((membership) => membership.status === 'active');

      if (!hasRestaurantMembership) {
        await logout();

        setError(
          'This account does not have restaurant access. Please use the correct login portal.'
        );

        return;
      }

      // Resolve the landing page through the restaurant portal's permission routing.
      navigate('/restaurant', { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Login failed. Please check your credentials and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7f9] lg:grid lg:grid-cols-[0.85fr_1.15fr]">

      {/* LEFT BRAND PANEL */}
      <aside className="relative hidden min-h-screen overflow-hidden bg-[#21150f] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">

        <div className="absolute -right-40 top-20 h-[460px] w-[460px] rounded-full border border-orange-400/15" />
        <div className="absolute -right-24 top-36 h-[320px] w-[320px] rounded-full border border-orange-400/15" />
        <div className="absolute -bottom-36 -left-32 h-[450px] w-[450px] rounded-full bg-orange-500/10 blur-3xl" />

        {/* Logo */}
        <Link
          to="/login"
          className="relative z-10 flex w-fit items-center gap-3"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/30">
            <ChefHat size={27} />
          </div>

          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              FoodieHub
            </h1>

            <p className="text-xs tracking-wide text-orange-200/70">
              RESTAURANT MANAGEMENT
            </p>
          </div>
        </Link>

        {/* Branding content */}
        <div className="relative z-10 max-w-xl">

          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-xs font-semibold tracking-wide text-orange-200">
            <Sparkles size={15} />
            YOUR BUSINESS, OUR PLATFORM
          </div>

          <h2 className="text-5xl font-extrabold leading-[1.15] xl:text-6xl">
            Manage your restaurant.

            <span className="mt-2 block text-orange-400">
              Grow your business.
            </span>
          </h2>

          <p className="mt-6 max-w-md text-base leading-8 text-slate-300">
            Everything you need to manage your restaurant operations,
            organize your menu and stay connected with your business
            from one centralized workspace.
          </p>

          <div className="mt-10 space-y-5">
            {[
              'Manage restaurant orders in one place',
              'Control your menu and food availability',
              'Monitor restaurant performance',
              'Manage your restaurant operations',
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 text-sm text-slate-200"
              >
                <CheckCircle2
                  size={19}
                  className="shrink-0 text-orange-400"
                />
                {item}
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/20 text-orange-300">
                <ShieldCheck size={23} />
              </div>

              <div>
                <p className="font-bold">
                  Your restaurant, securely managed
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Access your workspace using your registered account.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-500">
          © {new Date().getFullYear()} FoodieHub. All rights reserved.
        </p>
      </aside>

      {/* RIGHT LOGIN PANEL */}
      <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-10 xl:px-16">

        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link to="/login" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white">
                <ChefHat size={25} />
              </div>

              <div>
                <h1 className="text-xl font-extrabold text-slate-900">
                  FoodieHub
                </h1>

                <p className="text-[10px] font-semibold tracking-wider text-slate-500">
                  RESTAURANT PORTAL
                </p>
              </div>
            </Link>
          </div>

          {/* Login card */}
          <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_70px_-35px_rgba(15,23,42,0.22)] sm:p-9">

            {/* Heading */}
            <div className="mb-7">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                <Store size={24} />
              </div>

              <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
                Restaurant Partner Portal
              </p>

              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                Welcome back!
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Sign in to access your restaurant workspace and manage
                your business.
              </p>
            </div>

            {/* Login/Register tabs */}
            <div className="mb-8 grid grid-cols-2 rounded-xl bg-slate-100 p-1">

              <div className="flex items-center justify-center gap-2 rounded-lg bg-white py-3 text-sm font-bold text-orange-600 shadow-sm">
                <Store size={17} />
                Sign in
              </div>

              <Link
                to="/restaurant/register"
                className="flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-slate-500 transition hover:bg-white hover:text-orange-600"
              >
                <UserPlus size={17} />
                Register
              </Link>
            </div>

            {/* Registration success message */}
            {registrationMessage && (
              <div
                role="status"
                className="mb-6 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-700"
              >
                <ShieldCheck size={19} className="mt-0.5 shrink-0" />
                <span>{registrationMessage}</span>
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-base font-bold text-slate-900">
                Sign in to your account
              </h3>

              <p className="mt-1 text-xs text-slate-400">
                Enter your registered email and password.
              </p>
            </div>

            {/* Login form */}
            <form onSubmit={handleSubmit} className="space-y-5">

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              {/* Email */}
              <div>
                <label
                  htmlFor="restaurant-email"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Email address
                </label>

                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="restaurant-email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3.5 pl-11 pr-4 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10 hover:border-slate-300"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="restaurant-password"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Password
                </label>

                <div className="relative">
                  <LockKeyhole
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="restaurant-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3.5 pl-11 pr-12 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10 hover:border-slate-300"
                    required
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-orange-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-3 rounded-xl bg-orange-500 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition duration-200 hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-xl hover:shadow-orange-500/25 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {loading ? 'Signing in...' : 'Sign in to FoodieHub'}

                {!loading && (
                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-1"
                  />
                )}
              </button>
            </form>

            {/* Registration prompt */}
            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                <Store size={20} />
              </div>

              <h3 className="font-bold text-slate-900">
                New to FoodieHub?
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Register your restaurant and submit your application
                to become a FoodieHub partner.
              </p>

              <Link
                to="/restaurant/register"
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-5 py-3 text-sm font-bold text-orange-600 transition hover:border-orange-400 hover:bg-orange-50"
              >
                Register Your Restaurant
                <ArrowRight size={17} />
              </Link>
            </div>
          </div>

          {/* Footer links */}
          <div className="mt-6 text-center">
            <Link
              to="/admin/login"
              className="text-xs font-medium text-slate-400 transition hover:text-orange-600"
            >
              Restaurant owner Login
            </Link>
          </div>

          <p className="mt-4 text-center text-xs text-slate-400">
            Secure restaurant onboarding · FoodieHub
          </p>
        </div>
      </main>
    </div>
  );
}

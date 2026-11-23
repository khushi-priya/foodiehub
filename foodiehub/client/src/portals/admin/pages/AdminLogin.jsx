
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UtensilsCrossed,
  CheckCircle2,
  ShoppingBag,
  Store,
  Shield,
} from 'lucide-react';

import {
  useAuth,
  homePath,
  getUserRoles,
} from '../../../context/AuthContext';

const accountTypes = [
  {
    id: 'customer',
    label: 'Customer',
    description: 'Explore food and place orders',
    icon: ShoppingBag,
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    description: 'Manage your restaurant',
    icon: Store,
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'Manage the FoodieHub platform',
    icon: Shield,
  },
];

export default function AdminLogin() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasAdminAccess = (authenticatedUser) => {
    return getUserRoles(authenticatedUser).includes('super_admin');
  };

  // Redirect an already authenticated Super Admin.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (user && hasAdminAccess(user)) {
    return <Navigate to={homePath(user)} replace />;
  }

  const handleRoleChange = (role) => {
    setError('');
    setSelectedRole(role);

    // Restaurant has its own login and registration portal.
    if (role === 'restaurant') {
      navigate('/restaurant/login');
      return;
    }

    // Customer portal can be connected separately.
    if (role === 'customer') {
      navigate('/customer/login');
      return;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setSubmitting(true);

    try {
      let authenticatedUser = user;

      if (!authenticatedUser || !hasAdminAccess(authenticatedUser)) {
        authenticatedUser = await login(email.trim(), password);
      }

      if (!hasAdminAccess(authenticatedUser)) {
        setError(
          'This account does not have Admin access. Please sign in using an authorized Super Admin account.'
        );
        return;
      }

      navigate(homePath(authenticatedUser), {
        replace: true,
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Unable to sign in. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-[1.05fr_0.95fr]">

      {/* Left branding panel */}
      <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#171B2D] p-12 text-white lg:flex xl:p-16">

        <div className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full border border-white/10" />

        <div className="absolute -right-20 -top-20 h-[340px] w-[340px] rounded-full border border-white/10" />

        <div className="absolute -bottom-48 -left-32 h-[520px] w-[520px] rounded-full bg-orange-500/10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/20">
            <UtensilsCrossed size={24} />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              FoodieHub
            </h1>

            <p className="text-xs tracking-widest text-slate-400">
              RESTAURANT MANAGEMENT PLATFORM
            </p>
          </div>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-orange-300">
            <span className="h-2 w-2 rounded-full bg-orange-400" />
            ONE PLATFORM. MULTIPLE POSSIBILITIES.
          </div>

          <h2 className="text-5xl font-bold leading-[1.15] tracking-tight xl:text-6xl">
            One Platform.

            <span className="block text-orange-400">
              Multiple Possibilities.
            </span>
          </h2>

          <p className="mt-7 max-w-lg text-base leading-8 text-slate-400">
            Manage your restaurant, orders, customers and
            platform from one place.
          </p>

          <div className="mt-10 space-y-4">
            {[
              'Easy and secure account access',
              'Manage your activities from one place',
              'A dedicated experience for every role',
            ].map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-3 text-sm text-slate-300"
              >
                <CheckCircle2
                  size={18}
                  className="text-orange-400"
                />
                {feature}
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500">
          <span>© 2026 FoodieHub</span>
          <span>Built for smarter food businesses</span>
        </div>
      </section>

      {/* Right login panel */}
      <section className="flex min-h-screen items-center justify-center bg-[#F8F9FC] px-5 py-10 sm:px-10">

        <div className="w-full max-w-[460px]">

          {/* Mobile branding */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white">
              <UtensilsCrossed size={22} />
            </div>

            <span className="text-2xl font-bold text-slate-900">
              FoodieHub
            </span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
              <ShieldCheck size={29} />
            </div>

            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-orange-600">
              Restaurant Management Platform
            </p>

            <h2 className="text-3xl font-bold tracking-tight text-[#171B2D] sm:text-4xl">
              Welcome to FoodieHub
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Sign in to access your FoodieHub account.
            </p>
          </div>

          {/* Account type selection */}
          <div className="mb-7">
            <label className="mb-3 block text-sm font-semibold text-slate-700">
              Choose your account type
            </label>

            <div className="grid grid-cols-3 gap-3">
              {accountTypes.map((account) => {
                const Icon = account.icon;
                const active = selectedRole === account.id;

                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => handleRoleChange(account.id)}
                    className={`relative flex min-h-[112px] flex-col items-center justify-center rounded-xl border-2 p-3 text-center transition ${
                      active
                        ? 'border-orange-500 bg-orange-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-orange-200'
                    }`}
                  >
                    <Icon
                      size={25}
                      className={
                        active
                          ? 'text-orange-600'
                          : 'text-slate-400'
                      }
                    />

                    <span
                      className={`mt-2 text-sm font-bold ${
                        active
                          ? 'text-orange-700'
                          : 'text-slate-700'
                      }`}
                    >
                      {account.label}
                    </span>

                    <span className="mt-1 text-[10px] leading-4 text-slate-400">
                      {account.description}
                    </span>

                    {active && (
                      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-orange-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Admin login form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Email Address
              </label>

              <div className="flex h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 transition focus-within:border-orange-400 focus-within:ring-4 focus-within:ring-orange-500/10">
                <Mail
                  size={19}
                  className="shrink-0 text-slate-400"
                />

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email address"
                  autoComplete="username"
                  required
                  className="h-full w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Password
              </label>

              <div className="flex h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 transition focus-within:border-orange-400 focus-within:ring-4 focus-within:ring-orange-500/10">
                <LockKeyhole
                  size={19}
                  className="shrink-0 text-slate-400"
                />

                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  className="h-full w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="text-slate-400 transition hover:text-slate-700"
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-orange-500 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in...' : 'Sign In as Admin'}

              {!submitting && <ArrowRight size={19} />}
            </button>
          </form>

          {/* Security message */}
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <ShieldCheck
              size={19}
              className="mt-0.5 shrink-0 text-emerald-600"
            />

            <p className="text-xs leading-5 text-slate-500">
              Authorized Super Administrators only. Your platform
              access is protected by secure authentication.
            </p>
          </div>

          <p className="mt-8 text-center text-xs text-slate-400">
            FoodieHub · Secure Account Access
          </p>

        </div>
      </section>
    </main>
  );
}

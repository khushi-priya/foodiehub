
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../services/api';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Phone,
  Store,
  User,
  UtensilsCrossed,
} from 'lucide-react';

const initialForm = {
  restaurantName: '',
  restaurantEmail: '',
  restaurantPhone: '',
  description: '',
  ownerFirstName: '',
  ownerLastName: '',
  ownerEmail: '',
  ownerPhone: '',
  password: '',
  confirmPassword: '',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[6-9]\d{9}$/;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#]).{8,20}$/;

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  icon: Icon,
  type = 'text',
  required = false,
  maxLength,
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className="text-sm font-semibold text-stone-700"
      >
        {label}
        {required && <span className="ml-1 text-orange-600">*</span>}
      </label>

      <div className="relative">
        {Icon && (
          <Icon
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
          />
        )}

        <input
          id={name}
          name={name}
          type={type}
          inputMode={type === 'tel' ? 'numeric' : undefined}
          pattern={type === 'tel' ? '[0-9]*' : undefined}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          onKeyDown={(event) => {
            if (
              type === 'tel' &&
              !/^\d$/.test(event.key) &&
              ![
                'Backspace',
                'Delete',
                'ArrowLeft',
                'ArrowRight',
                'Tab',
                'Home',
                'End',
              ].includes(event.key) &&
              !(event.ctrlKey || event.metaKey)
            ) {
              event.preventDefault();
            }
          }}
          className={`w-full rounded-xl border border-stone-200 bg-stone-50 py-3 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100 ${
            Icon ? 'pl-11 pr-4' : 'px-4'
          }`}
        />
      </div>
    </div>
  );
}

function PasswordField({
  label,
  name,
  value,
  onChange,
  show,
  setShow,
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={name}
        className="text-sm font-semibold text-stone-700"
      >
        {label}
        <span className="ml-1 text-orange-600">*</span>
      </label>

      <div className="relative">
        <LockKeyhole
          size={18}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
        />

        <input
          id={name}
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required
          className="w-full rounded-xl border border-stone-200 bg-stone-50 py-3 pl-11 pr-12 text-sm text-stone-800 outline-none transition focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100"
        />

        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

export default function RestaurantRegister() {
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (event) => {
    const { name } = event.target;
    let { value } = event.target;

    // Allow only digits and a maximum of 10 characters
    // for restaurant and owner mobile numbers.
    if (name === 'restaurantPhone' || name === 'ownerPhone') {
      value = value.replace(/\D/g, '').slice(0, 10);
    }

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (error) setError('');
  };

  const validateForm = () => {
    if (!form.restaurantName.trim()) {
      return 'Please enter your restaurant name.';
    }

    if (!EMAIL_REGEX.test(form.restaurantEmail.trim())) {
      return 'Please enter a valid restaurant email address.';
    }

    if (!PHONE_REGEX.test(form.restaurantPhone.trim())) {
      return 'Enter a valid 10-digit restaurant mobile number.';
    }

    if (!form.ownerFirstName.trim()) {
      return 'Please enter the owner first name.';
    }

    if (!form.ownerLastName.trim()) {
      return 'Please enter the owner last name.';
    }

    if (!EMAIL_REGEX.test(form.ownerEmail.trim())) {
      return 'Please enter a valid owner email address.';
    }

    if (
      form.ownerPhone.trim() &&
      !PHONE_REGEX.test(form.ownerPhone.trim())
    ) {
      return 'Enter a valid 10-digit owner mobile number.';
    }

    if (!PASSWORD_REGEX.test(form.password)) {
      return 'Password must be 8–20 characters and include uppercase, lowercase, number and special character.';
    }

    if (form.password !== form.confirmPassword) {
      return 'Password and confirm password do not match.';
    }

    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      restaurantName: form.restaurantName.trim(),
      restaurantEmail: form.restaurantEmail.trim().toLowerCase(),
      restaurantPhone: form.restaurantPhone.trim(),
      description: form.description.trim(),
      ownerFirstName: form.ownerFirstName.trim(),
      ownerLastName: form.ownerLastName.trim(),
      ownerEmail: form.ownerEmail.trim().toLowerCase(),
      ownerPhone: form.ownerPhone.trim(),
      password: form.password,
      confirmPassword: form.confirmPassword,
    };

    try {
      setLoading(true);

      const response = await api.post(
        '/auth/restaurant/register',
        payload
      );

      const data = response.data;

      if (data.success === false) {
        throw new Error(
          data.message ||
            data.error ||
            'Restaurant registration failed. Please try again.'
        );
      }

      navigate('/restaurant/login', {
        replace: true,
        state: {
          registrationMessage:
            data.message ||
            'Registration submitted successfully. You can now log in and track your restaurant application.',
          registeredEmail: payload.ownerEmail,
        },
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Unable to connect to the server. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf8f5] lg:grid lg:grid-cols-2">
      {/* LEFT BRAND PANEL */}
      <section className="relative hidden min-h-screen overflow-hidden bg-[#24150f] px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl" />

        <Link
          to="/"
          className="relative flex w-fit items-center gap-3"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500">
            <UtensilsCrossed size={25} />
          </div>

          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              FoodieHub
            </h1>
            <p className="text-xs tracking-[0.22em] text-orange-200">
              RESTAURANT MANAGEMENT
            </p>
          </div>
        </Link>

        <div className="relative max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-400/10 px-4 py-2 text-sm text-orange-200">
            <Store size={16} />
            Join FoodieHub
          </div>

          <h2 className="text-5xl font-bold leading-tight xl:text-6xl">
            Bring your
            <span className="block text-orange-400">
              restaurant
            </span>
            to FoodieHub.
          </h2>

          <p className="mt-7 max-w-md text-lg leading-8 text-stone-300">
            Create your restaurant account and manage your
            restaurant operations from one simple platform.
          </p>

          <div className="mt-10 space-y-5">
            {[
              'Create your restaurant profile',
              'Manage your restaurant from one place',
              'Track your application approval',
              'Access your dedicated restaurant dashboard',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2
                  size={20}
                  className="shrink-0 text-orange-400"
                />
                <span className="text-sm text-stone-200">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-sm text-stone-500">
          © {new Date().getFullYear()} FoodieHub. All rights reserved.
        </p>
      </section>

      {/* RIGHT REGISTRATION FORM */}
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-xl">
          <Link
            to="/restaurant/login"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-orange-600"
          >
            <ArrowLeft size={17} />
            Back to login
          </Link>

          <div className="mb-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 lg:hidden">
              <UtensilsCrossed size={25} />
            </div>

            <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-orange-600">
              Restaurant registration
            </p>

            <h2 className="text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">
              Create your account
            </h2>

            <p className="mt-3 text-sm leading-6 text-stone-500">
              Enter your restaurant and owner details to get
              started with FoodieHub.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-7">
            {/* RESTAURANT DETAILS */}
            <div>
              <div className="mb-4 flex items-center gap-2 border-b border-stone-200 pb-3">
                <Store size={18} className="text-orange-600" />
                <h3 className="font-bold text-stone-800">
                  Restaurant details
                </h3>
              </div>

              <div className="space-y-4">
                <Field
                  label="Restaurant name"
                  name="restaurantName"
                  value={form.restaurantName}
                  onChange={handleChange}
                  placeholder="e.g. The Food Corner"
                  icon={UtensilsCrossed}
                  required
                />

                <Field
                  label="Restaurant email address"
                  name="restaurantEmail"
                  value={form.restaurantEmail}
                  onChange={handleChange}
                  placeholder="restaurant@example.com"
                  icon={Mail}
                  type="email"
                  required
                />

                <Field
                  label="Restaurant phone number"
                  name="restaurantPhone"
                  value={form.restaurantPhone}
                  onChange={handleChange}
                  placeholder="10-digit mobile number"
                  icon={Phone}
                  type="tel"
                  maxLength={10}
                  required
                />

                <div className="space-y-1.5">
                  <label
                    htmlFor="description"
                    className="text-sm font-semibold text-stone-700"
                  >
                    Restaurant description
                    <span className="ml-2 text-xs font-normal text-stone-400">
                      (Optional)
                    </span>
                  </label>

                  <textarea
                    id="description"
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    rows={3}
                    maxLength={1000}
                    placeholder="Tell us a little about your restaurant..."
                    className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-100"
                  />
                </div>
              </div>
            </div>

            {/* OWNER DETAILS */}
            <div>
              <div className="mb-4 flex items-center gap-2 border-b border-stone-200 pb-3">
                <User size={18} className="text-orange-600" />
                <h3 className="font-bold text-stone-800">
                  Owner details
                </h3>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="First name"
                    name="ownerFirstName"
                    value={form.ownerFirstName}
                    onChange={handleChange}
                    placeholder="First name"
                    icon={User}
                    required
                  />

                  <Field
                    label="Last name"
                    name="ownerLastName"
                    value={form.ownerLastName}
                    onChange={handleChange}
                    placeholder="Last name"
                    required
                  />
                </div>

                <Field
                  label="Owner email address"
                  name="ownerEmail"
                  value={form.ownerEmail}
                  onChange={handleChange}
                  placeholder="owner@example.com"
                  icon={Mail}
                  type="email"
                  required
                />

                <Field
                  label="Owner phone number"
                  name="ownerPhone"
                  value={form.ownerPhone}
                  onChange={handleChange}
                  placeholder="10-digit mobile number"
                  icon={Phone}
                  type="tel"
                  maxLength={10}
                />

                <p className="-mt-2 text-xs text-stone-400">
                  Optional. Used as the owner's contact number.
                </p>
              </div>
            </div>

            {/* PASSWORD */}
            <div>
              <div className="mb-4 flex items-center gap-2 border-b border-stone-200 pb-3">
                <LockKeyhole size={18} className="text-orange-600" />
                <h3 className="font-bold text-stone-800">
                  Login credentials
                </h3>
              </div>

              <div className="space-y-4">
                <PasswordField
                  label="Password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  show={showPassword}
                  setShow={setShowPassword}
                />

                <PasswordField
                  label="Confirm password"
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  show={showConfirmPassword}
                  setShow={setShowConfirmPassword}
                />

                <p className="text-xs leading-5 text-stone-500">
                  Password must contain 8–20 characters, including
                  uppercase, lowercase, a number and a special
                  character.
                </p>
              </div>
            </div>

            {/* ERROR */}
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {/* SUBMIT */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating account...
                </>
              ) : (
                <>
                  Submit registration
                  <ArrowRight size={19} />
                </>
              )}
            </button>

            <p className="text-center text-sm text-stone-500">
              Already have an account?{' '}
              <Link
                to="/restaurant/login"
                className="font-bold text-orange-600 hover:text-orange-700"
              >
                Sign in
              </Link>
            </p>

            <p className="text-center text-xs leading-5 text-stone-400">
              Your restaurant application will be submitted for
              approval. You can log in to track its status.
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}

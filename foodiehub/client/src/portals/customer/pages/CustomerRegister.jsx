// import { useEffect, useState } from "react";
// import { Link, useLocation, useNavigate } from "react-router-dom";
// import { useAuth, getUserRoles } from "../../../context/AuthContext";
// import { api } from "../../../services/api";

// export default function CustomerRegister() {
//   const { user } = useAuth();
//   const navigate = useNavigate();
//   const location = useLocation();
//   const returnTo = location.state?.from
//     ? `${location.state.from.pathname || '/customer/dashboard'}${location.state.from.search || ''}${location.state.from.hash || ''}`
//     : '/customer/dashboard';
//   const [form, setForm] = useState({
//     firstName: "",
//     lastName: "",
//     email: "",
//     phone: "",
//     password: "",
//     confirmPassword: "",
//   });
//   const [busy, setBusy] = useState(false);
//   const [error, setError] = useState("");
//   useEffect(() => {
//     if (user)
//       navigate(
//         getUserRoles(user).includes("customer")
//           ? returnTo
//           : "/unauthorized",
//         { replace: true },
//       );
//   }, [user, navigate, returnTo]);
//   function change(e) {
//     setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
//   }
//   async function submit(e) {
//     e.preventDefault();
//     setError("");
//     if (form.password !== form.confirmPassword) {
//       setError("Passwords do not match.");
//       return;
//     }
//     setBusy(true);
//     try {
//       const response = await api.post("/auth/customer/register", form);
//       navigate("/customer/verify-email", { replace: true, state: { email: response.data?.data?.email || form.email.trim().toLowerCase(), returnTo } });
//     } catch (err) {
//       const response = err.response;
//       const code = response?.data?.code;
//       if ((response?.status === 429 || response?.status === 503) && response.data?.data?.requiresEmailVerification) {
//         const deliveryError = response.status === 429
//           ? 'Please wait before requesting another verification code.'
//           : 'We couldn\'t send your verification email right now. Please try again later.';
//         navigate('/customer/verify-email', { replace: true, state: { email: response.data?.data?.email || form.email.trim().toLowerCase(), returnTo, deliveryError, retryAfterSeconds: response.data.retryAfterSeconds } });
//         return;
//       }
//       if (code === 'EMAIL_ALREADY_REGISTERED') setError('This email is already registered. Please sign in.');
//       else if (code === 'PHONE_ALREADY_REGISTERED') setError('This mobile number is already in use.');
//       else if (code === 'EMAIL_VERIFICATION_PENDING') navigate('/customer/verify-email', { replace: true, state: { email: response.data?.data?.email || form.email.trim().toLowerCase(), returnTo } });
//       else if (response?.status === 429) setError('Too many verification requests. Please wait and try again.');
//       else if (response?.status === 503) setError('We couldn\'t send your verification email right now. Please try again later.');
//       else setError(response?.status === 409 ? 'An account already exists with these details. Please sign in or check the mobile number.' : 'Unable to create your account. Please check your details and try again.');
//     } finally {
//       setBusy(false);
//     }
//   }
//   const fields = [
//     ["firstName", "First name", "text"],
//     ["lastName", "Last name", "text"],
//     ["email", "Email", "email"],
//     ["phone", "Mobile number", "tel"],
//     ["password", "Password", "password"],
//     ["confirmPassword", "Confirm password", "password"],
//   ];
//   return (
//     <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] p-5">
//       <form
//         onSubmit={submit}
//         className="w-full max-w-lg space-y-4 rounded-3xl border border-orange-100 bg-white p-8 shadow-xl"
//       >
//         <Link to="/" className="text-xl font-extrabold">
//           Foodie<span className="text-orange-500">Hub</span>
//         </Link>
//         <div>
//           <h1 className="mt-4 text-3xl font-bold">Create your account</h1>
//           <p className="mt-2 text-sm text-slate-500">
//             Join FoodieHub to explore local restaurants.
//           </p>
//         </div>
//         <div className="grid gap-4 sm:grid-cols-2">
//           {fields.map(([name, label, type]) => (
//             <label key={name} className="block text-sm font-medium">
//               {label}
//               <input
//                 required
//                 type={type}
//                 name={name}
//                 autoComplete={name === "password" ? "new-password" : name}
//                 value={form[name]}
//                 onChange={change}
//                 className="mt-1 w-full rounded-xl border p-3"
//               />
//             </label>
//           ))}
//         </div>
//         <p className="text-xs text-slate-400">
//           Password: 8–20 characters with uppercase, lowercase, number and
//           special character.
//         </p>
//         {error && (
//           <p
//             role="alert"
//             className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
//           >
//             {error}
//           </p>
//         )}
//         <button
//           disabled={busy}
//           className="w-full rounded-xl bg-orange-500 p-3 font-bold text-white disabled:opacity-60"
//         >
//           {busy ? "Creating account…" : "Create account"}
//         </button>
//         <p className="text-center text-sm text-slate-500">
//           Already registered?{" "}
//           <Link className="font-bold text-orange-600" to="/customer/login" state={location.state}>
//             Sign in
//           </Link>
//         </p>
//       </form>
//     </main>
//   );
// }


import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, getUserRoles } from "../../../context/AuthContext";
import { api } from "../../../services/api";

export default function CustomerRegister() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const returnTo = location.state?.from
    ? `${location.state.from.pathname || "/customer/dashboard"}${location.state.from.search || ""}${location.state.from.hash || ""}`
    : "/customer/dashboard";

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
    if (user) {
      navigate(
        getUserRoles(user).includes("customer")
          ? returnTo
          : "/unauthorized",
        { replace: true }
      );
    }
  }, [user, navigate, returnTo]);

  function change(e) {
    const { name, value } = e.target;

    if (name === "phone") {
      // Allow only digits and maximum 10 digits.
      const digitsOnly = value.replace(/\D/g, "").slice(0, 10);

      setForm((f) => ({ ...f, phone: digitsOnly }));
      return;
    }

    setForm((f) => ({ ...f, [name]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (!/^[6-9]\d{9}$/.test(form.phone)) {
      setError("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const response = await api.post("/auth/customer/register", form);

      navigate("/customer/verify-email", {
        replace: true,
        state: {
          email: response.data?.data?.email || form.email.trim().toLowerCase(),
          returnTo,
        },
      });
    } catch (err) {
      const response = err.response;
      const code = response?.data?.code;

      if (
        (response?.status === 429 || response?.status === 503) &&
        response.data?.data?.requiresEmailVerification
      ) {
        const deliveryError =
          response.status === 429
            ? "Please wait before requesting another verification code."
            : "We couldn't send your verification email right now. Please try again later.";

        navigate("/customer/verify-email", {
          replace: true,
          state: {
            email: response.data?.data?.email || form.email.trim().toLowerCase(),
            returnTo,
            deliveryError,
            retryAfterSeconds: response.data.retryAfterSeconds,
          },
        });
        return;
      }

      if (code === "EMAIL_ALREADY_REGISTERED")
        setError("This email is already registered. Please sign in.");
      else if (code === "PHONE_ALREADY_REGISTERED")
        setError("This mobile number is already in use.");
      else if (code === "EMAIL_VERIFICATION_PENDING")
        navigate("/customer/verify-email", {
          replace: true,
          state: {
            email: response.data?.data?.email || form.email.trim().toLowerCase(),
            returnTo,
          },
        });
      else if (response?.status === 429)
        setError("Too many verification requests. Please wait and try again.");
      else if (response?.status === 503)
        setError("We couldn't send your verification email right now. Please try again later.");
      else
        setError(
          response?.status === 409
            ? "An account already exists with these details. Please sign in or check the mobile number."
            : "Unable to create your account. Please check your details and try again."
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
                required
                type={type}
                name={name}
                inputMode={name === "phone" ? "numeric" : undefined}
                pattern={name === "phone" ? "[6-9][0-9]{9}" : undefined}
                maxLength={name === "phone" ? 10 : undefined}
                autoComplete={
                  name === "password" || name === "confirmPassword"
                    ? "new-password"
                    : name === "phone"
                      ? "tel"
                      : name
                }
                placeholder={
                  name === "phone" ? "Enter 10-digit mobile number" : ""
                }
                value={form[name]}
                onChange={change}
                className="mt-1 w-full rounded-xl border p-3 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />

              {name === "phone" && (
                <span className="mt-1 block text-xs text-slate-400">
                  {form.phone.length}/10 digits
                </span>
              )}
            </label>
          ))}
        </div>

        <p className="text-xs text-slate-400">
          Password: 8–20 characters with uppercase, lowercase, number and
          special character.
        </p>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
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
          <Link
            className="font-bold text-orange-600"
            to="/customer/login"
            state={location.state}
          >
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}


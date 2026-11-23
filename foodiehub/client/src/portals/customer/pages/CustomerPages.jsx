// import { useEffect, useState } from "react";
// import { Link } from "react-router-dom";
// import { api } from "../../../services/api";

// function Frame({ title, subtitle, children }) {
//   return (
//     <section className="space-y-5">
//       <header>
//         <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
//         <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
//       </header>
//       {children}
//     </section>
//   );
// }
// function Alert({ error, notice }) {
//   return (
//     <>
//       {error && (
//         <p
//           role="alert"
//           className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
//         >
//           {error}
//         </p>
//       )}
//       {notice && (
//         <p
//           role="status"
//           className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"
//         >
//           {notice}
//         </p>
//       )}
//     </>
//   );
// }
// const errMsg = (e) =>
//   e.response?.data?.message || e.message || "Request failed.";

// export function CustomerProfile() {
//   const [data, setData] = useState(null),
//     [form, setForm] = useState({}),
//     [password, setPassword] = useState({
//       currentPassword: "",
//       newPassword: "",
//       confirmPassword: "",
//     }),
//     [error, setError] = useState(""),
//     [notice, setNotice] = useState("");
//   useEffect(() => {
//     api
//       .get("/customer/profile")
//       .then((r) => {
//         setData(r.data.data);
//         setForm(r.data.data);
//       })
//       .catch((e) => setError(errMsg(e)));
//   }, []);
//   async function save(e) {
//     e.preventDefault();
//     setError("");
//     setNotice("");
//     try {
//       const r = await api.put("/customer/profile", form);
//       setData(r.data.data);
//       setNotice("Profile updated.");
//     } catch (e) {
//       setError(errMsg(e));
//     }
//   }
//   async function changePassword(e) {
//     e.preventDefault();
//     setError("");
//     setNotice("");
//     try {
//       await api.put("/customer/password", password);
//       setPassword({
//         currentPassword: "",
//         newPassword: "",
//         confirmPassword: "",
//       });
//       setNotice("Password changed.");
//     } catch (e) {
//       setError(errMsg(e));
//     }
//   }
//   return (
//     <Frame
//       title="My Profile"
//       subtitle="Update your contact details and password."
//     >
//       <Alert error={error} notice={notice} />
//       {data && (
//         <div className="grid gap-5 lg:grid-cols-2">
//           <form
//             onSubmit={save}
//             className="space-y-4 rounded-2xl border bg-white p-5"
//           >
//             <h2 className="font-bold">Personal information</h2>
//             {[
//               ["firstName", "First name"],
//               ["lastName", "Last name"],
//               ["phone", "Mobile number"],
//             ].map(([key, label]) => (
//               <label key={key} className="block text-sm font-medium">
//                 {label}
//                 <input
//                   value={form[key] || ""}
//                   onChange={(e) =>
//                     setForm((f) => ({ ...f, [key]: e.target.value }))
//                   }
//                   className="mt-1 w-full rounded-xl border p-3"
//                 />
//               </label>
//             ))}
//             <label className="block text-sm font-medium">
//               Email
//               <input
//                 readOnly
//                 value={data.email || ""}
//                 className="mt-1 w-full rounded-xl border bg-slate-50 p-3 text-slate-500"
//               />
//             </label>
//             <button className="rounded-xl bg-orange-500 px-5 py-3 font-bold text-white">
//               Save profile
//             </button>
//           </form>
//           <form
//             onSubmit={changePassword}
//             className="space-y-4 rounded-2xl border bg-white p-5"
//           >
//             <h2 className="font-bold">Change password</h2>
//             {[
//               ["currentPassword", "Current password"],
//               ["newPassword", "New password"],
//               ["confirmPassword", "Confirm new password"],
//             ].map(([key, label]) => (
//               <label key={key} className="block text-sm font-medium">
//                 {label}
//                 <input
//                   required
//                   type="password"
//                   value={password[key]}
//                   onChange={(e) =>
//                     setPassword((p) => ({ ...p, [key]: e.target.value }))
//                   }
//                   className="mt-1 w-full rounded-xl border p-3"
//                 />
//               </label>
//             ))}
//             <button className="rounded-xl border border-orange-300 px-5 py-3 font-bold text-orange-700">
//               Update password
//             </button>
//           </form>
//         </div>
//       )}
//     </Frame>
//   );
// }

// export function CustomerAddresses() {
//   const blank = {
//     fullName: "",
//     phone: "",
//     house: "",
//     street: "",
//     landmark: "",
//     city: "",
//     state: "",
//     postalCode: "",
//     addressType: "home",
//     isDefault: false,
//   };
//   const [items, setItems] = useState([]),
//     [form, setForm] = useState(blank),
//     [editing, setEditing] = useState(""),
//     [error, setError] = useState(""),
//     [notice, setNotice] = useState("");
//   const load = () =>
//     api
//       .get("/customer/addresses")
//       .then((r) => setItems(r.data.data || []))
//       .catch((e) => setError(errMsg(e)));
//   useEffect(() => {
//     load();
//   }, []);
//   async function save(e) {
//     e.preventDefault();
//     setError("");
//     try {
//       if (editing) await api.put(`/customer/addresses/${editing}`, form);
//       else await api.post("/customer/addresses", form);
//       setForm(blank);
//       setEditing("");
//       setNotice("Address saved.");
//       load();
//     } catch (e) {
//       setError(errMsg(e));
//     }
//   }
//   async function remove(id) {
//     try {
//       await api.delete(`/customer/addresses/${id}`);
//       setNotice("Address removed.");
//       load();
//     } catch (e) {
//       setError(errMsg(e));
//     }
//   }
//   return (
//     <Frame
//       title="My Addresses"
//       subtitle="Addresses are private to your customer account."
//     >
//       <Alert error={error} notice={notice} />
//       <form
//         onSubmit={save}
//         className="grid gap-3 rounded-2xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
//       >
//         {[
//           ["fullName", "Full name", "fullName"],
//           ["phone", "Mobile number", "phone"],
//           ["house", "House / flat", "house"],
//           ["street", "Street / area", "street"],
//           ["landmark", "Landmark", "landmark"],
//           ["city", "City", "city"],
//           ["state", "State", "state"],
//           ["postalCode", "Postal code", "postalCode"],
//         ].map(([key, label, name]) => (
//           <label key={key} className="text-sm font-medium">
//             {label}
//             <input
//               required={!["landmark"].includes(key)}
//               value={form[name] || ""}
//               onChange={(e) =>
//                 setForm((f) => ({ ...f, [name]: e.target.value }))
//               }
//               className="mt-1 w-full rounded-xl border p-3"
//             />
//           </label>
//         ))}
//         <label className="text-sm font-medium">
//           Type
//           <select
//             value={form.addressType}
//             onChange={(e) =>
//               setForm((f) => ({ ...f, addressType: e.target.value }))
//             }
//             className="mt-1 w-full rounded-xl border p-3"
//           >
//             <option value="home">Home</option>
//             <option value="work">Work</option>
//             <option value="other">Other</option>
//           </select>
//         </label>
//         <label className="flex items-center gap-2 text-sm">
//           <input
//             type="checkbox"
//             checked={!!form.isDefault}
//             onChange={(e) =>
//               setForm((f) => ({ ...f, isDefault: e.target.checked }))
//             }
//           />
//           Default address
//         </label>
//         <div className="flex items-center gap-2">
//           <button className="rounded-xl bg-orange-500 px-4 py-3 font-bold text-white">
//             {editing ? "Update" : "Add"} address
//           </button>
//           {editing && (
//             <button
//               type="button"
//               onClick={() => {
//                 setEditing("");
//                 setForm(blank);
//               }}
//               className="p-3 text-sm"
//             >
//               Cancel
//             </button>
//           )}
//         </div>
//       </form>
//       <div className="grid gap-3 md:grid-cols-2">
//         {items.map((a) => (
//           <article key={a.id} className="rounded-2xl border bg-white p-5">
//             <div className="flex justify-between">
//               <strong>
//                 {a.fullName} · {a.addressType}
//               </strong>
//               {a.isDefault && (
//                 <span className="text-xs font-bold text-emerald-600">
//                   DEFAULT
//                 </span>
//               )}
//             </div>
//             <p className="mt-2 text-sm text-slate-600">
//               {[a.house, a.street, a.landmark, a.city, a.state, a.postalCode]
//                 .filter(Boolean)
//                 .join(", ")}
//             </p>
//             <p className="mt-1 text-sm text-slate-500">{a.phone}</p>
//             <div className="mt-4 flex gap-4 text-sm">
//               <button
//                 onClick={() => {
//                   setEditing(a.id);
//                   setForm({ ...a });
//                 }}
//                 className="font-semibold text-orange-600"
//               >
//                 Edit
//               </button>
//               <button
//                 onClick={() => remove(a.id)}
//                 className="font-semibold text-red-600"
//               >
//                 Remove
//               </button>
//             </div>
//           </article>
//         ))}
//       </div>
//       {!items.length && (
//         <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500">
//           No saved addresses yet.
//         </p>
//       )}
//     </Frame>
//   );
// }

// export function CustomerOrders() {
//   const [items, setItems] = useState([]),
//     [error, setError] = useState("");
//   useEffect(() => {
//     api
//       .get("/customer/orders")
//       .then((r) => setItems(r.data.data.orders || []))
//       .catch((e) => setError(errMsg(e)));
//   }, []);
//   return (
//     <Frame
//       title="My Orders"
//       subtitle="Order history from your customer account."
//     >
//       {error && <Alert error={error} />}
//       {items.length
//         ? items.map((o) => (
//             <article key={o.id} className="rounded-2xl border bg-white p-5">
//               <div className="flex flex-wrap justify-between gap-3">
//                 <div>
//                   <h2 className="font-bold">
//                     {o.restaurant?.name || "Restaurant"} · #{o.orderNumber}
//                   </h2>
//                   <p className="mt-1 text-sm text-slate-500">
//                     {new Date(o.createdAt).toLocaleString()}
//                   </p>
//                 </div>
//                 <div className="text-right">
//                   <p className="font-bold">
//                     ₹{Number(o.total || 0).toFixed(2)}
//                   </p>
//                   <p className="text-sm capitalize text-slate-500">
//                     {o.status}
//                   </p>
//                 </div>
//               </div>
//             </article>
//           ))
//         : !error && (
//             <div className="rounded-2xl border bg-white p-10 text-center">
//               <h2 className="font-bold">No orders yet</h2>
//               <p className="mt-1 text-sm text-slate-500">
//                 Orders will appear here after you place an order.
//               </p>
//               <Link
//                 to="/restaurants"
//                 className="mt-4 inline-block font-semibold text-orange-600"
//               >
//                 Browse restaurants
//               </Link>
//             </div>
//           )}
//     </Frame>
//   );
// }

// export function CustomerWishlist() {
//   const [items, setItems] = useState([]),
//     [error, setError] = useState(""),
//     [notice, setNotice] = useState("");
//   const load = () =>
//     api
//       .get("/customer/wishlist")
//       .then((r) => setItems(r.data.data || []))
//       .catch((e) => setError(errMsg(e)));
//   useEffect(() => {
//     load();
//   }, []);
//   async function remove(id) {
//     try {
//       await api.delete(`/customer/wishlist/${id}`);
//       setNotice("Removed from wishlist.");
//       load();
//     } catch (e) {
//       setError(errMsg(e));
//     }
//   }
//   return (
//     <Frame title="Wishlist" subtitle="Restaurants and menu items you saved.">
//       <Alert error={error} notice={notice} />
//       {items.length ? (
//         <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
//           {items.map((w) => (
//             <article key={w.id} className="rounded-2xl border bg-white p-5">
//               <h2 className="font-bold">{w.name || "Saved item"}</h2>
//               <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
//                 {w.type}
//               </p>
//               {w.slug && (
//                 <Link
//                   to={`/restaurants/${w.slug}`}
//                   className="mt-3 inline-block text-sm font-semibold text-orange-600"
//                 >
//                   View restaurant
//                 </Link>
//               )}
//               <button
//                 onClick={() => remove(w.id)}
//                 className="mt-4 block text-sm font-semibold text-red-600"
//               >
//                 Remove
//               </button>
//             </article>
//           ))}
//         </div>
//       ) : (
//         !error && (
//           <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
//             Your wishlist is empty. Save a restaurant or menu item to find it
//             here.
//           </div>
//         )
//       )}
//     </Frame>
//   );
// }

// export function CustomerPlaceholder({ title, description }) {
//   return (
//     <Frame title={title} subtitle={description}>
//       <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
//         <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
//           Planned for a later phase
//         </p>
//         <h2 className="mt-3 text-xl font-bold text-slate-800">
//           This feature is not available yet
//         </h2>
//         <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
//           {description}
//         </p>
//       </div>
//     </Frame>
//   );
// }


import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  UserRound,
  MapPin,
  Phone,
  Home,
  BriefcaseBusiness,
  MapPinned,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Star,
  ShoppingBag,
  Heart,
  LockKeyhole,
  LoaderCircle,
} from "lucide-react";
import { api } from "../../../services/api";
import AddressLocationPicker from "../../../components/AddressLocationPicker";

function Frame({ title, subtitle, children }) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function Alert({ error, notice }) {
  return (
    <>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {notice}
        </p>
      )}
    </>
  );
}

const errMsg = (e) =>
  e.response?.data?.message || e.message || "Request failed.";

const blankAddress = {
  fullName: "",
  phone: "",
  house: "",
  street: "",
  landmark: "",
  city: "",
  state: "",
  postalCode: "",
  latitude: "",
  longitude: "",
  addressType: "home",
  isDefault: false,
};

function AddressTypeIcon({ type, size = 20 }) {
  if (type === "work") return <BriefcaseBusiness size={size} />;
  if (type === "other") return <MapPinned size={size} />;
  return <Home size={size} />;
}

function AddressModal({ form, setForm, editing, onClose, onSave, saving }) {
  const [validationError, setValidationError] = useState("");

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setValidationError("");
  }

  function submit(e) {
    e.preventDefault();

    const phone = String(form.phone || "").replace(/\D/g, "");
    const postalCode = String(form.postalCode || "").trim();

    if (!/^[6-9]\d{9}$/.test(phone)) {
      setValidationError(
        "Enter a valid 10-digit Indian mobile number starting with 6–9."
      );
      return;
    }

    if (!/^\d{6}$/.test(postalCode)) {
      setValidationError("Enter a valid 6-digit postal code.");
      return;
    }

    onSave(e);
  }

  const fields = [
    { key: "fullName", label: "Full name", placeholder: "Enter full name" },
    { key: "phone", label: "Mobile number", placeholder: "10-digit mobile number", type: "tel" },
    { key: "house", label: "House / Flat", placeholder: "House or flat number" },
    { key: "street", label: "Street / Area", placeholder: "Street, locality or sector" },
    { key: "landmark", label: "Landmark", placeholder: "Nearby landmark (optional)", optional: true },
    { key: "city", label: "City", placeholder: "Enter city" },
    { key: "state", label: "State", placeholder: "Enter state" },
    { key: "postalCode", label: "Postal code", placeholder: "6-digit PIN code" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-modal-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2
              id="address-modal-title"
              className="text-xl font-extrabold text-slate-900"
            >
              {editing ? "Edit Address" : "Add New Address"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Save an address for a faster checkout experience.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto">
          <div className="space-y-5 p-6">
            {validationError && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {validationError}
              </p>
            )}

            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-800">
                Contact information
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.slice(0, 2).map((field) => (
                  <label key={field.key} className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                      {field.label}
                    </span>
                    <input
                      required
                      type={field.type || "text"}
                      inputMode={field.key === "phone" ? "numeric" : undefined}
                      maxLength={field.key === "phone" ? 10 : undefined}
                      value={form[field.key] || ""}
                      onChange={(e) => {
                        const value =
                          field.key === "phone"
                            ? e.target.value.replace(/\D/g, "").slice(0, 10)
                            : e.target.value;
                        updateField(field.key, value);
                      }}
                      placeholder={field.placeholder}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-800">
                Address details
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.slice(2).map((field) => (
                  <label key={field.key} className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                      {field.label}
                      {field.optional && (
                        <span className="ml-1 font-normal text-slate-400">
                          (Optional)
                        </span>
                      )}
                    </span>
                    <input
                      required={!field.optional}
                      type="text"
                      inputMode={field.key === "postalCode" ? "numeric" : undefined}
                      maxLength={field.key === "postalCode" ? 6 : undefined}
                      value={form[field.key] || ""}
                      onChange={(e) => {
                        const value =
                          field.key === "postalCode"
                            ? e.target.value.replace(/\D/g, "").slice(0, 6)
                            : e.target.value;
                        updateField(field.key, value);
                      }}
                      placeholder={field.placeholder}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                    />
                  </label>
                ))}
              </div>
            </div>

            <AddressLocationPicker
              latitude={form.latitude}
              longitude={form.longitude}
              onCoordinatesChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))}
              onAddressChange={(locationAddress) => setForm((current) => ({ ...current, ...locationAddress }))}
            />

            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-800">
                Address type
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {["home", "work", "other"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateField("addressType", type)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold capitalize transition ${
                      form.addressType === type
                        ? "border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-100"
                        : "border-slate-200 text-slate-600 hover:border-orange-200"
                    }`}
                  >
                    <AddressTypeIcon type={type} size={17} />
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={!!form.isDefault}
                onChange={(e) => updateField("isDefault", e.target.checked)}
                className="h-4 w-4 accent-orange-500"
              />
              <span>
                <span className="block text-sm font-bold text-slate-800">
                  Set as default address
                </span>
                <span className="text-xs text-slate-500">
                  Use this address automatically during checkout.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <LoaderCircle size={17} className="animate-spin" /> : <Check size={17} />}
              {saving ? "Saving..." : editing ? "Update Address" : "Save Address"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CustomerProfile() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api
      .get("/customer/profile")
      .then((r) => {
        setData(r.data.data);
        setForm(r.data.data);
      })
      .catch((e) => setError(errMsg(e)));
  }, []);

  async function save(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const r = await api.put("/customer/profile", form);
      setData(r.data.data);
      setNotice("Profile updated.");
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (password.newPassword !== password.confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      await api.put("/customer/password", password);
      setPassword({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setNotice("Password changed.");
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <Frame title="My Profile" subtitle="Manage your personal details and account security.">
      <Alert error={error} notice={notice} />

      {data && (
        <div className="grid gap-5 lg:grid-cols-2">
          <form onSubmit={save} className="space-y-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-xl bg-orange-50 p-3 text-orange-600">
                <UserRound size={22} />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">Personal information</h2>
                <p className="text-xs text-slate-500">Your contact details</p>
              </div>
            </div>

            {[
              ["firstName", "First name"],
              ["lastName", "Last name"],
              ["phone", "Mobile number"],
            ].map(([key, label]) => (
              <label key={key} className="block text-sm font-semibold text-slate-700">
                {label}
                <input
                  value={form[key] || ""}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </label>
            ))}

            <label className="block text-sm font-semibold text-slate-700">
              Email
              <input
                readOnly
                value={data.email || ""}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-normal text-slate-500"
              />
            </label>

            <button className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600">
              Save profile
            </button>
          </form>

          <form onSubmit={changePassword} className="space-y-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-xl bg-orange-50 p-3 text-orange-600">
                <LockKeyhole size={22} />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">Change password</h2>
                <p className="text-xs text-slate-500">Keep your account secure</p>
              </div>
            </div>

            {[
              ["currentPassword", "Current password"],
              ["newPassword", "New password"],
              ["confirmPassword", "Confirm new password"],
            ].map(([key, label]) => (
              <label key={key} className="block text-sm font-semibold text-slate-700">
                {label}
                <input
                  required
                  type="password"
                  value={password[key]}
                  onChange={(e) => setPassword((p) => ({ ...p, [key]: e.target.value }))}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </label>
            ))}

            <button className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-3 text-sm font-bold text-orange-700 hover:bg-orange-100">
              Update password
            </button>
          </form>
        </div>
      )}
    </Frame>
  );
}

export function CustomerAddresses() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blankAddress);
  const [editing, setEditing] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await api.get("/customer/addresses");
      setItems(r.data.data || []);
      setError("");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) load(); });
    return () => { active = false; };
  }, []);

  function openAdd() {
    setEditing("");
    setForm({ ...blankAddress });
    setError("");
    setNotice("");
    setModalOpen(true);
  }

  function openEdit(address) {
    setEditing(address.id);
    setForm({
      ...blankAddress,
      ...address,
      phone: String(address.phone || ""),
      postalCode: String(address.postalCode || ""),
    });
    setError("");
    setNotice("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing("");
    setForm({ ...blankAddress });
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);

    try {
      const payload = {
        ...form,
        phone: String(form.phone || "").replace(/\D/g, ""),
        postalCode: String(form.postalCode || "").trim(),
      };

      if (editing) {
        await api.put(`/customer/addresses/${editing}`, payload);
      } else {
        await api.post("/customer/addresses", payload);
      }

      setModalOpen(false);
      setEditing("");
      setForm({ ...blankAddress });
      setNotice(editing ? "Address updated successfully." : "Address added successfully.");
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    const confirmed = window.confirm("Are you sure you want to remove this address?");
    if (!confirmed) return;

    setRemoving(id);
    setError("");
    setNotice("");

    try {
      await api.delete(`/customer/addresses/${id}`);
      setNotice("Address removed successfully.");
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setRemoving("");
    }
  }

  return (
    <Frame
      title="Saved Addresses"
      subtitle="Manage your delivery addresses for a quicker checkout."
    >
      <Alert error={error} notice={notice} />

      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-orange-500 to-orange-400 p-6 text-white shadow-lg shadow-orange-500/10 sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-orange-50">
              <MapPin size={17} />
              YOUR DELIVERY LOCATIONS
            </div>
            <h2 className="text-2xl font-extrabold">
              Your addresses, your convenience.
            </h2>
            <p className="mt-2 max-w-md text-sm text-orange-50">
              Save your favorite delivery locations and choose one whenever you order.
            </p>
            <p className="mt-4 text-sm font-bold">
              {items.length} {items.length === 1 ? "saved address" : "saved addresses"}
            </p>
          </div>

          <button
            type="button"
            onClick={openAdd}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-orange-600 shadow-sm transition hover:bg-orange-50"
          >
            <Plus size={19} />
            Add New Address
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            Your saved locations
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose and manage where you want your orders delivered.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
          {items.length} ADDRESSES
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-100 bg-white p-12 text-sm text-slate-500">
          <LoaderCircle size={20} className="mr-2 animate-spin" />
          Loading your addresses...
        </div>
      ) : items.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((address) => (
            <article
              key={address.id}
              className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                address.isDefault
                  ? "border-orange-200 ring-1 ring-orange-100"
                  : "border-slate-100"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-orange-50 p-3 text-orange-600">
                    <AddressTypeIcon type={address.addressType} size={21} />
                  </div>
                  <div>
                    <h3 className="font-bold capitalize text-slate-900">
                      {address.addressType || "Address"}
                    </h3>
                    <p className="text-xs text-slate-400">Delivery location</p>
                  </div>
                </div>

                {address.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-emerald-700">
                    <Star size={11} fill="currentColor" />
                    DEFAULT
                  </span>
                )}
              </div>

              <div className="mt-5">
                <h4 className="text-base font-extrabold text-slate-900">
                  {address.fullName}
                </h4>

                <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-slate-600">
                  <MapPin size={16} className="mt-1 shrink-0 text-orange-500" />
                  <span>
                    {[
                      address.house,
                      address.street,
                      address.landmark,
                      address.city,
                      address.state,
                      address.postalCode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </p>

                <p className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Phone size={15} className="text-slate-400" />
                  {address.phone}
                </p>
                {address.latitude != null && address.longitude != null && <a href={`https://www.openstreetmap.org/?mlat=${address.latitude}&mlon=${address.longitude}#map=16/${address.latitude}/${address.longitude}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-orange-700"><MapPin size={13}/>View saved map pin</a>}
              </div>

              <div className="mt-auto flex items-center gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => openEdit(address)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm font-bold text-orange-700 transition hover:bg-orange-100"
                >
                  <Pencil size={15} />
                  Edit
                </button>

                <button
                  type="button"
                  disabled={removing === address.id}
                  onClick={() => remove(address.id)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                >
                  {removing === address.id ? (
                    <LoaderCircle size={15} className="animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
            <MapPin size={30} />
          </div>
          <h3 className="mt-5 text-lg font-extrabold text-slate-900">
            No saved addresses yet
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Add your home or work address to make your next order quicker and easier.
          </p>
          <button
            type="button"
            onClick={openAdd}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
          >
            <Plus size={18} />
            Add your first address
          </button>
        </div>
      )}

      {modalOpen && (
        <AddressModal
          form={form}
          setForm={setForm}
          editing={editing}
          onClose={closeModal}
          onSave={save}
          saving={saving}
        />
      )}
    </Frame>
  );
}

export function CustomerOrders() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/customer/orders")
      .then((r) => setItems(r.data.data.orders || []))
      .catch((e) => setError(errMsg(e)));
  }, []);

  return (
    <Frame title="My Orders" subtitle="Order history from your customer account.">
      {error && <Alert error={error} />}

      {items.length ? (
        <div className="space-y-4">
          {items.map((o) => (
            <article key={o.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">
                    {o.restaurant?.name || "Restaurant"} · #{o.orderNumber}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {new Date(o.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">
                    ₹{Number(o.total || 0).toFixed(2)}
                  </p>
                  <p className="text-sm capitalize text-slate-500">{o.status}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
            <ShoppingBag size={32} className="mx-auto text-slate-300" />
            <h2 className="mt-3 font-bold text-slate-900">No orders yet</h2>
            <p className="mt-1 text-sm text-slate-500">
              Orders will appear here after you place an order.
            </p>
            <Link
              to="/restaurants"
              className="mt-4 inline-block font-semibold text-orange-600"
            >
              Browse restaurants
            </Link>
          </div>
        )
      )}
    </Frame>
  );
}

export function CustomerWishlist() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () =>
    api
      .get("/customer/wishlist")
      .then((r) => setItems(r.data.data || []))
      .catch((e) => setError(errMsg(e)));

  useEffect(() => {
    load();
  }, []);

  async function remove(id) {
    try {
      await api.delete(`/customer/wishlist/${id}`);
      setNotice("Removed from wishlist.");
      load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <Frame title="Wishlist" subtitle="Restaurants and menu items you saved.">
      <Alert error={error} notice={notice} />

      {items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((w) => (
            <article key={w.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                <Heart size={21} />
              </div>
              <h2 className="font-bold text-slate-900">{w.name || "Saved item"}</h2>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                {w.type}
              </p>
              {w.slug && (
                <Link
                  to={`/restaurants/${w.slug}`}
                  className="mt-3 inline-block text-sm font-semibold text-orange-600"
                >
                  View restaurant
                </Link>
              )}
              <button
                onClick={() => remove(w.id)}
                className="mt-4 block text-sm font-semibold text-red-600"
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      ) : (
        !error && (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
            Your wishlist is empty. Save a restaurant or menu item to find it here.
          </div>
        )
      )}
    </Frame>
  );
}

export function CustomerPlaceholder({ title, description }) {
  return (
    <Frame title={title} subtitle={description}>
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-600">
          Planned for a later phase
        </p>
        <h2 className="mt-3 text-xl font-bold text-slate-800">
          This feature is not available yet
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
    </Frame>
  );
}

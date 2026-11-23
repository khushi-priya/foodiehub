// import { useEffect, useState } from "react";
// import { Link, useSearchParams } from "react-router-dom";
// import {
//   ArrowLeft,
//   LoaderCircle,
//   Search,
//   SlidersHorizontal,
// } from "lucide-react";
// import { api } from "../../../services/api";
// import { useAuth, getUserRoles } from "../../../context/AuthContext";
// import RestaurantCard from "../components/RestaurantCard";

// const failureMessage = (error) =>
//   error.response?.data?.message || "Restaurants could not be loaded.";

// export default function Restaurants() {
//   const { user } = useAuth();
//   const [searchParams, setSearchParams] = useSearchParams();
//   const [term, setTerm] = useState(searchParams.get("search") || "");
//   const [search, setSearch] = useState(searchParams.get("search") || "");
//   const [category, setCategory] = useState(searchParams.get("category") || "");
//   const [foodType, setFoodType] = useState("");
//   const [service, setService] = useState("");
//   const [openNow, setOpenNow] = useState(false);
//   const [sort, setSort] = useState("relevance");
//   const [page, setPage] = useState(1);
//   const [restaurants, setRestaurants] = useState([]);
//   const [categories, setCategories] = useState([]);
//   const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");
//   const [saveNotice, setSaveNotice] = useState("");
//   async function saveRestaurant(restaurant) {
//     if (!getUserRoles(user).includes('customer')) { setSaveNotice('Sign in as a customer to save restaurants.'); return; }
//     try { await api.post('/customer/wishlist', { type: 'restaurant', restaurantId: restaurant.id }); setSaveNotice(`${restaurant.name} saved to your wishlist.`); }
//     catch (e) { setSaveNotice(e.response?.data?.message || 'Could not save this restaurant.'); }
//   }
//   useEffect(() => {
//     setTerm(searchParams.get("search") || "");
//     setSearch(searchParams.get("search") || "");
//     setCategory(searchParams.get("category") || "");
//   }, [searchParams]);
//   useEffect(() => {
//     let active = true;
//     setLoading(true);
//     setError("");
//     const params = { page, limit: 12, sort };
//     if (search) params.search = search;
//     if (category) params.category = category;
//     if (foodType) params.foodType = foodType;
//     if (service) params[service] = "true";
//     if (openNow) params.openNow = "true";
//     api
//       .get("/public/restaurants", { params })
//       .then((response) => {
//         if (!active) return;
//         const data = response.data.data;
//         setRestaurants(data.restaurants || []);
//         setCategories(data.filters?.categories || []);
//         setPagination(data.pagination || { total: 0, totalPages: 0 });
//       })
//       .catch((requestError) => {
//         if (active) setError(failureMessage(requestError));
//       })
//       .finally(() => {
//         if (active) setLoading(false);
//       });
//     return () => {
//       active = false;
//     };
//   }, [search, category, foodType, service, openNow, sort, page]);
//   function submit(event) {
//     event.preventDefault();
//     setPage(1);
//     setSearch(term.trim());
//     const next = new URLSearchParams(searchParams);
//     if (term.trim()) next.set("search", term.trim());
//     else next.delete("search");
//     setSearchParams(next);
//   }
//   function update(setter, value) {
//     setter(value);
//     setPage(1);
//   }

//   return (
//     <main className="min-h-screen bg-[#fffaf6] text-slate-900">
//       <header className="border-b border-slate-100 bg-white">
//         <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
//           <Link to="/" className="font-extrabold text-xl">
//             Foodie<span className="text-orange-500">Hub</span>
//           </Link>
//           <Link
//             to="/login"
//             className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
//           >
//             Sign in
//           </Link>
//         </div>
//       </header>
//       <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
//         <Link
//           to="/"
//           className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-orange-600"
//         >
//           <ArrowLeft size={15} />
//           Home
//         </Link>
//         <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
//           <div>
//             <p className="text-xs font-bold uppercase tracking-[2px] text-orange-500">
//               FoodieHub Marketplace
//             </p>
//             <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
//               Restaurants near you
//             </h1>
//             <p className="mt-2 text-sm text-slate-500">
//               Browse restaurants that are approved and listed on FoodieHub.
//             </p>
//           </div>
//           <p className="text-sm text-slate-500">
//             {pagination.total} restaurants
//           </p>
//         </div>
//         {saveNotice && <p role="status" className="mt-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-800">{saveNotice} <Link to="/customer/login" className="font-bold underline">Customer sign in</Link></p>}
//         <div className="mt-7 grid gap-6 lg:grid-cols-[260px_1fr]">
//           <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5">
//             <div className="mb-4 flex items-center gap-2 font-bold">
//               <SlidersHorizontal size={17} className="text-orange-500" />
//               Filters
//             </div>
//             <form onSubmit={submit} className="flex gap-2">
//               <input
//                 value={term}
//                 onChange={(e) => setTerm(e.target.value)}
//                 placeholder="Restaurant, food, city"
//                 className="min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-orange-400"
//               />
//               <button
//                 aria-label="Search"
//                 className="rounded-xl bg-orange-500 px-3 text-white"
//               >
//                 <Search size={17} />
//               </button>
//             </form>
//             <label className="mt-4 block text-xs font-semibold text-slate-600">
//               Food category
//               <select
//                 className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
//                 value={category}
//                 onChange={(e) => update(setCategory, e.target.value)}
//               >
//                 <option value="">All categories</option>
//                 {categories.map((item) => (
//                   <option key={item.id} value={item.id}>
//                     {item.name}
//                   </option>
//                 ))}
//               </select>
//             </label>
//             <label className="mt-4 block text-xs font-semibold text-slate-600">
//               Food preference
//               <select
//                 className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
//                 value={foodType}
//                 onChange={(e) => update(setFoodType, e.target.value)}
//               >
//                 <option value="">All food types</option>
//                 <option value="veg">Veg</option>
//                 <option value="non_veg">Non-Veg</option>
//                 <option value="egg">Egg</option>
//               </select>
//             </label>
//             <label className="mt-4 block text-xs font-semibold text-slate-600">
//               Service
//               <select
//                 className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
//                 value={service}
//                 onChange={(e) => update(setService, e.target.value)}
//               >
//                 <option value="">All services</option>
//                 <option value="delivery">Delivery</option>
//                 <option value="takeaway">Takeaway</option>
//                 <option value="dineIn">Dine-in</option>
//               </select>
//             </label>
//             <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
//               <input
//                 type="checkbox"
//                 checked={openNow}
//                 onChange={(e) => update(setOpenNow, e.target.checked)}
//               />
//               Open now
//             </label>
//             <label className="mt-4 block text-xs font-semibold text-slate-600">
//               Sort by
//               <select
//                 className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
//                 value={sort}
//                 onChange={(e) => update(setSort, e.target.value)}
//               >
//                 <option value="relevance">Relevance</option>
//                 <option value="preparationTime">Preparation time</option>
//               </select>
//             </label>
//             <p className="mt-4 text-[11px] leading-5 text-slate-400">
//               Cuisine and customer ratings are not available in restaurant
//               records yet.
//             </p>
//           </aside>
//           <section>
//             {error && (
//               <div
//                 role="alert"
//                 className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
//               >
//                 {error}
//               </div>
//             )}
//             {loading ? (
//               <div className="flex min-h-64 items-center justify-center">
//                 <LoaderCircle className="animate-spin text-orange-500" />
//               </div>
//             ) : restaurants.length ? (
//               <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
//                 {restaurants.map((restaurant) => (
//                   <RestaurantCard key={restaurant.id} restaurant={restaurant} onSave={saveRestaurant} />
//                 ))}
//               </div>
//             ) : (
//               !error && (
//                 <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
//                   <Search className="mx-auto text-slate-300" />
//                   <h2 className="mt-3 font-bold text-slate-800">
//                     No restaurants found
//                   </h2>
//                   <p className="mt-1 text-sm text-slate-500">
//                     Try a different search or clear some filters.
//                   </p>
//                 </div>
//               )
//             )}
//             {pagination.totalPages > 1 && (
//               <div className="mt-6 flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm text-slate-500">
//                 <span>
//                   Page {page} of {pagination.totalPages}
//                 </span>
//                 <div className="flex gap-2">
//                   <button
//                     disabled={page <= 1 || loading}
//                     onClick={() => setPage((value) => value - 1)}
//                     className="rounded-lg border px-3 py-2 disabled:opacity-40"
//                   >
//                     Previous
//                   </button>
//                   <button
//                     disabled={page >= pagination.totalPages || loading}
//                     onClick={() => setPage((value) => value + 1)}
//                     className="rounded-lg border px-3 py-2 disabled:opacity-40"
//                   >
//                     Next
//                   </button>
//                 </div>
//               </div>
//             )}
//           </section>
//         </div>
//       </div>
//     </main>
//   );
// }


import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Heart,
  LoaderCircle,
  MapPin,
  Search,
  SlidersHorizontal,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { api } from "../../../services/api";
import { useAuth, getUserRoles, homePath } from "../../../context/AuthContext";
import RestaurantCard from "../components/RestaurantCard";

const failureMessage = (error) =>
  error.response?.data?.message || "Restaurants could not be loaded.";

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 pr-10 text-sm font-medium text-slate-700 outline-none transition hover:border-orange-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
    </label>
  );
}

function RestaurantSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
      <div className="h-48 animate-pulse bg-slate-100" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

export default function Restaurants() {
  const { user } = useAuth();
  const homeTarget = user ? homePath(user) : "/";
  const [searchParams, setSearchParams] = useSearchParams();

  const [term, setTerm] = useState(searchParams.get("search") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [category, setCategory] = useState(
    searchParams.get("category") || ""
  );

  const [foodType, setFoodType] = useState("");
  const [service, setService] = useState("");
  const [openNow, setOpenNow] = useState(false);
  const [sort, setSort] = useState("relevance");

  const [page, setPage] = useState(1);
  const [restaurants, setRestaurants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [mobileFilters, setMobileFilters] = useState(false);

  useEffect(() => {
    setTerm(searchParams.get("search") || "");
    setSearch(searchParams.get("search") || "");
    setCategory(searchParams.get("category") || "");
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    let active = true;

    async function loadRestaurants() {
      setLoading(true);
      setError("");

      const params = { page, limit: 12, sort };

      if (search) params.search = search;
      if (category) params.category = category;
      if (foodType) params.foodType = foodType;
      if (service) params[service] = "true";
      if (openNow) params.openNow = "true";

      try {
        const response = await api.get("/public/restaurants", { params });

        if (!active) return;

        const data = response.data.data;

        setRestaurants(data.restaurants || []);
        setCategories(data.filters?.categories || []);
        setPagination(
          data.pagination || { total: 0, totalPages: 0 }
        );
      } catch (requestError) {
        if (active) setError(failureMessage(requestError));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRestaurants();

    return () => {
      active = false;
    };
  }, [search, category, foodType, service, openNow, sort, page]);

  async function saveRestaurant(restaurant) {
    if (!getUserRoles(user).includes("customer")) {
      setSaveNotice("Please sign in as a customer to save restaurants.");
      return;
    }

    try {
      await api.post("/customer/wishlist", {
        type: "restaurant",
        restaurantId: restaurant.id,
      });

      setSaveNotice(`${restaurant.name} saved to your wishlist.`);
    } catch (e) {
      setSaveNotice(
        e.response?.data?.message || "Could not save this restaurant."
      );
    }
  }

  function submit(event) {
    event.preventDefault();

    const value = term.trim();
    setPage(1);
    setSearch(value);

    const next = new URLSearchParams(searchParams);

    if (value) next.set("search", value);
    else next.delete("search");

    setSearchParams(next);
  }

  function update(setter, value) {
    setter(value);
    setPage(1);
  }

  function clearFilters() {
    setCategory("");
    setFoodType("");
    setService("");
    setOpenNow(false);
    setSort("relevance");
    setTerm("");
    setSearch("");
    setPage(1);
    setSearchParams({});
  }

  const activeFilters = [
    category,
    foodType,
    service,
    openNow,
  ].filter(Boolean).length;

  const filterContent = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={18} className="text-orange-500" />
          <h2 className="font-bold text-slate-900">Filters</h2>
        </div>
        <button
          onClick={clearFilters}
          className="text-xs font-semibold text-orange-600 hover:text-orange-700"
        >
          Clear all
        </button>
      </div>

      <div className="h-px bg-slate-100" />

      <form onSubmit={submit}>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
          Search restaurants
        </label>
        <div className="relative">
          <Search
            size={17}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Restaurant, food, city..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-500/10"
          />
        </div>
        <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white transition hover:bg-orange-600">
          <Search size={16} />
          Search
        </button>
      </form>

      <div className="h-px bg-slate-100" />

      <FilterSelect
        label="Food category"
        value={category}
        onChange={(e) => update(setCategory, e.target.value)}
        options={[
          { value: "", label: "All categories" },
          ...categories.map((item) => ({
            value: item.id,
            label: item.name,
          })),
        ]}
      />

      <FilterSelect
        label="Food preference"
        value={foodType}
        onChange={(e) => update(setFoodType, e.target.value)}
        options={[
          { value: "", label: "All food types" },
          { value: "veg", label: "Vegetarian" },
          { value: "non_veg", label: "Non-Vegetarian" },
          { value: "egg", label: "Egg" },
        ]}
      />

      <FilterSelect
        label="Service"
        value={service}
        onChange={(e) => update(setService, e.target.value)}
        options={[
          { value: "", label: "All services" },
          { value: "delivery", label: "Delivery" },
          { value: "takeaway", label: "Takeaway" },
          { value: "dineIn", label: "Dine-in" },
        ]}
      />

      <div className="h-px bg-slate-100" />

      <label className="flex cursor-pointer items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-50 text-green-600">
            <Clock3 size={17} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Open right now
            </p>
            <p className="text-xs text-slate-400">
              Currently accepting orders
            </p>
          </div>
        </div>

        <input
          type="checkbox"
          checked={openNow}
          onChange={(e) => update(setOpenNow, e.target.checked)}
          className="h-4 w-4 accent-orange-500"
        />
      </label>

      <div className="h-px bg-slate-100" />

      <FilterSelect
        label="Sort restaurants"
        value={sort}
        onChange={(e) => update(setSort, e.target.value)}
        options={[
          { value: "relevance", label: "Recommended" },
          { value: "preparationTime", label: "Preparation time" },
        ]}
      />

      <p className="text-xs leading-5 text-slate-400">
        Explore approved restaurants and find your next favourite meal.
      </p>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#faf9f7] text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link to={homeTarget} className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
              <UtensilsCrossed size={21} />
            </div>
            <span className="text-xl font-black tracking-tight">
              Foodie<span className="text-orange-500">Hub</span>
            </span>
          </Link>

          <div className="hidden items-center gap-2 text-sm text-slate-500 md:flex">
            <MapPin size={16} className="text-orange-500" />
            Discover great food and restaurants
          </div>

          <div className="flex items-center gap-3">
            <Link
              to={homeTarget}
              className="hidden text-sm font-semibold text-slate-600 hover:text-orange-600 sm:block"
            >
              Home
            </Link>
            {getUserRoles(user).includes("customer") ? <Link to="/customer/cart" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-500">My cart</Link> : !user && <Link to="/customer/login" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-500">Sign in</Link>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-10">
        <Link
          to={homeTarget}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-orange-600"
        >
          <ArrowLeft size={16} />
          Back to home
        </Link>

        {/* Hero */}
        <section className="relative mt-6 overflow-hidden rounded-3xl bg-[#231b18] px-6 py-10 text-white sm:px-10 sm:py-14">
          <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 right-1/4 h-64 w-64 rounded-full bg-orange-400/10 blur-3xl" />

          <div className="relative z-10 max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold tracking-wide text-orange-200">
              <UtensilsCrossed size={13} />
              FOODIEHUB MARKETPLACE
            </div>

            <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-5xl">
              Discover restaurants.
              <span className="block text-orange-400">
                Enjoy every bite.
              </span>
            </h1>

            <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300 sm:text-base">
              Explore amazing places to eat, discover delicious food and
              find the perfect restaurant for every occasion.
            </p>

            <form
              onSubmit={submit}
              className="mt-7 flex max-w-xl gap-2 rounded-2xl bg-white p-2 shadow-2xl shadow-black/20"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
                <Search size={20} className="shrink-0 text-orange-500" />
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search restaurants, food..."
                  className="w-full min-w-0 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>
              <button className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-600">
                Search
              </button>
            </form>
          </div>
        </section>

        {/* Notifications */}
        {saveNotice && (
          <div
            role="status"
            className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-800"
          >
            <span>{saveNotice}</span>
            <div className="flex shrink-0 items-center gap-3">
              <Link
                to="/customer/login"
                className="font-bold underline"
              >
                Customer sign in
              </Link>
              <button
                onClick={() => setSaveNotice("")}
                aria-label="Dismiss notification"
              >
                <X size={17} />
              </button>
            </div>
          </div>
        )}

        {/* Results heading */}
        <div className="mb-6 mt-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[2px] text-orange-500">
              Explore food
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              Restaurants near you
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Find the perfect place for your next meal.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full bg-orange-50 px-4 py-2 text-sm font-bold text-orange-700">
              {pagination.total} restaurants
            </span>

            <button
              onClick={() => setMobileFilters(true)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 lg:hidden"
            >
              <SlidersHorizontal size={16} />
              Filters
              {activeFilters > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs text-white">
                  {activeFilters}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="grid items-start gap-7 lg:grid-cols-[270px_minmax(0,1fr)]">
          {/* Desktop sidebar */}
          <aside className="sticky top-24 hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:block">
            {filterContent}
          </aside>

          {/* Restaurant results */}
          <section className="min-w-0">
            {error && (
              <div
                role="alert"
                className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
              >
                {error}
                <button
                  onClick={() => setPage((value) => value)}
                  className="ml-3 font-bold underline"
                >
                  Try again
                </button>
              </div>
            )}

            {loading ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <RestaurantSkeleton key={index} />
                ))}
              </div>
            ) : restaurants.length > 0 ? (
              <>
                <div className="mb-5 flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    Showing{" "}
                    <span className="font-bold text-slate-800">
                      {restaurants.length}
                    </span>{" "}
                    restaurants on this page
                  </p>
                  {activeFilters > 0 && (
                    <button
                      onClick={clearFilters}
                      className="text-xs font-bold text-orange-600 hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>

                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {restaurants.map((restaurant) => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      onSave={saveRestaurant}
                    />
                  ))}
                </div>
              </>
            ) : (
              !error && (
                <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                    <Search size={28} />
                  </div>
                  <h3 className="mt-5 text-xl font-extrabold text-slate-900">
                    No restaurants found
                  </h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                    We couldn't find any restaurants matching your
                    search. Try changing your filters or search for
                    something else.
                  </p>
                  <button
                    onClick={clearFilters}
                    className="mt-6 rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
                  >
                    Clear all filters
                  </button>
                </div>
              )
            )}

            {/* Pagination */}
            {!loading && pagination.totalPages > 1 && (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Page {page} of {pagination.totalPages}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Browse more restaurants
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-orange-300 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowLeft size={15} />
                    Previous
                  </button>

                  <button
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((value) => value + 1)}
                    className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close filters"
            onClick={() => setMobileFilters(false)}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          />

          <div className="absolute bottom-0 right-0 top-0 w-full max-w-sm overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="mb-7 flex items-center justify-between">
              <h2 className="text-xl font-black">Filters</h2>
              <button
                onClick={() => setMobileFilters(false)}
                className="rounded-xl bg-slate-100 p-2 text-slate-600"
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>

            {filterContent}

            <button
              onClick={() => setMobileFilters(false)}
              className="mt-7 w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white hover:bg-orange-600"
            >
              Show {pagination.total} restaurants
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

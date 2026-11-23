import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ClipboardList,
  Clock3,
  Heart,
  LoaderCircle,
  MapPinned,
  Search,
  ShoppingCart,
  Store,
  Utensils,
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { api } from "../../../services/api";
import RestaurantCard from "../components/RestaurantCard";

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
const message = (error) =>
  error.response?.data?.message || "Unable to load customer dashboard data.";

function SummaryCard({ title, value, icon: Icon, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-800">{value}</p>
        </div>
        <span className={`rounded-xl p-3 ${tone}`}>
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      api.get("/customer/summary"),
      api.get("/customer/orders", { params: { limit: 4 } }),
      api.get("/public/restaurants", { params: { limit: 3 } }),
    ])
      .then(([summaryResponse, orderResponse, restaurantResponse]) => {
        if (!active) return;
        setSummary(summaryResponse.data.data);
        setOrders(orderResponse.data.data.orders || []);
        setRestaurants(restaurantResponse.data.data.restaurants || []);
      })
      .catch((requestError) => {
        if (active) setError(message(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function saveRestaurant(restaurant) {
    try {
      await api.post("/customer/wishlist", {
        type: "restaurant",
        restaurantId: restaurant.id,
      });
      setNotice(`${restaurant.name} saved to your wishlist.`);
    } catch (err) {
      setNotice(
        err.response?.status === 401
          ? "Sign in as a customer to save restaurants."
          : message(err),
      );
    }
  }
  const firstName = user?.firstName || "there";
  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-3xl bg-[#171B2D] p-6 text-white sm:p-8">
        <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">
              Your FoodieHub
            </p>
            <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">
              Welcome, {firstName}!
            </h1>
            <p className="mt-2 text-sm text-slate-300 sm:text-base">
              What would you like to eat today?
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              navigate(
                `/restaurants${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`,
              );
            }}
            className="flex w-full max-w-lg gap-2 rounded-xl bg-white p-1.5"
          >
            <input
              aria-label="Search restaurants and food"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search restaurants and food"
              className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none"
            />
            <button className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">
              <Search size={17} />
              Search
            </button>
          </form>
        </div>
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total orders"
          value={loading ? "—" : (summary?.totalOrders ?? 0)}
          icon={ClipboardList}
          tone="bg-orange-50 text-orange-600"
        />
        <SummaryCard
          title="Active orders"
          value={loading ? "—" : (summary?.activeOrders ?? 0)}
          icon={Clock3}
          tone="bg-blue-50 text-blue-600"
        />
        <SummaryCard
          title="Completed orders"
          value={loading ? "—" : (summary?.completedOrders ?? 0)}
          icon={Store}
          tone="bg-emerald-50 text-emerald-600"
        />
        <SummaryCard
          title="Wishlist items"
          value={loading ? "—" : (summary?.wishlistItems ?? 0)}
          icon={Heart}
          tone="bg-pink-50 text-pink-600"
        />
      </section>
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Quick actions</h2>
            <p className="mt-1 text-sm text-slate-500">
              Pick up where you left off.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              to: "/restaurants",
              label: "Explore restaurants",
              icon: Search,
              style: "text-orange-600 bg-orange-50",
            },
            {
              to: "/customer/orders",
              label: "View my orders",
              icon: ClipboardList,
              style: "text-blue-600 bg-blue-50",
            },
            {
              to: "/customer/cart",
              label: "Open my cart",
              icon: ShoppingCart,
              style: "text-violet-600 bg-violet-50",
            },
            {
              to: "/customer/addresses",
              label: "Manage addresses",
              icon: MapPinned,
              style: "text-emerald-600 bg-emerald-50",
            },
          ].map(({ to, label, icon: Icon, style }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className={`rounded-xl p-3 ${style}`}>
                <Icon size={19} />
              </span>
              <span className="flex-1 text-sm font-semibold text-slate-700">
                {label}
              </span>
              <ArrowRight size={16} className="text-slate-300" />
            </Link>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              Recommended restaurants
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Approved restaurants currently listed on FoodieHub.
            </p>
          </div>
          <Link
            to="/restaurants"
            className="text-sm font-semibold text-orange-600"
          >
            Browse all
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-10">
            <LoaderCircle className="animate-spin text-orange-500" />
          </div>
        ) : restaurants.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {restaurants.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                onSave={saveRestaurant}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <Utensils className="mx-auto text-slate-300" />
            <p className="mt-2 font-semibold text-slate-700">
              No listed restaurants yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              New restaurants will appear here after approval and listing.
            </p>
          </div>
        )}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800">Recent orders</h2>
            <p className="mt-1 text-xs text-slate-400">
              Your latest order activity
            </p>
          </div>
          <Link
            to="/customer/orders"
            className="text-sm font-semibold text-orange-600"
          >
            All orders
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <LoaderCircle className="animate-spin text-orange-500" />
          </div>
        ) : orders.length ? (
          <div className="divide-y divide-slate-100">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {order.restaurant?.name || "Restaurant"}{" "}
                    <span className="font-normal text-slate-400">
                      · #{order.orderNumber}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(order.createdAt).toLocaleDateString()} ·{" "}
                    {order.items?.length || 0} items
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800">
                    {money(order.total)}
                  </p>
                  <p className="mt-1 text-xs capitalize text-slate-500">
                    {order.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 px-4 py-8 text-center">
            <p className="font-semibold text-slate-700">No orders yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Your orders will appear here after placing an order.
            </p>
            <Link
              to="/restaurants"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-orange-600"
            >
              Explore restaurants
              <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

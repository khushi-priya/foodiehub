import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Home,
  Store,
  ClipboardList,
  ShoppingCart,
  Heart,
  MapPinned,
  UserRound,
  Headset,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Utensils,
  CalendarDays,
  Bell,
} from "lucide-react";
import { homePath, useAuth } from "../../../context/AuthContext";
import { api } from "../../../services/api";
import { connectCustomerNotificationSocket } from "../../../services/socket";

const groups = [
  {
    title: "YOUR FOODIEHUB",
    links: [
      { label: "Dashboard", to: "/customer/dashboard", icon: Home },
      { label: "Browse Restaurants", to: "/restaurants", icon: Store },
      { label: "My Orders", to: "/customer/orders", icon: ClipboardList },
      { label: "My Reservations", to: "/customer/reservations", icon: CalendarDays },
      { label: "Notifications", to: "/customer/notifications", icon: Bell },
      { label: "My Cart", to: "/customer/cart", icon: ShoppingCart },
      { label: "Wishlist", to: "/customer/wishlist", icon: Heart },
    ],
  },
  {
    title: "ACCOUNT",
    links: [
      { label: "My Addresses", to: "/customer/addresses", icon: MapPinned },
      { label: "My Profile", to: "/customer/profile", icon: UserRound },
      { label: "Help & Support", to: "/customer/support", icon: Headset },
      { label: "Settings", to: "/customer/settings", icon: Settings },
    ],
  },
];

function Sidebar({ signOut, setMobileOpen, cartCount, unreadCount, homeTarget }) {
  return (
    <>
      <Link to={homeTarget} aria-label="FoodieHub customer home" className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white">
          <Utensils size={21} />
        </span>
        <div>
          <p className="text-lg font-bold text-white">FoodieHub</p>
          <p className="text-[10px] tracking-[0.15em] text-slate-400">
            CUSTOMER
          </p>
        </div>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-6">
        {groups.map((group) => (
          <div key={group.title} className="mb-7">
            <p className="mb-3 px-3 text-[10px] font-bold tracking-[0.16em] text-slate-500">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.links.map(({ label, to, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${isActive ? "bg-orange-500 text-white shadow-lg shadow-orange-950/20" : "text-slate-400 hover:bg-white/5 hover:text-white"}`
                  }
                >
                  <Icon size={18} />
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span>{label}</span>
                    {label === "My Cart" && cartCount > 0 && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold leading-4 text-white">{cartCount > 99 ? "99+" : cartCount}</span>}
                    {label === "Notifications" && unreadCount > 0 && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold leading-4 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-300"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </>
  );
}

export default function CustomerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "FoodieHub Customer";
  async function signOut() {
    try {
      await logout();
    } finally {
      navigate("/", { replace: true });
    }
  }
  useEffect(() => {
    let active = true;
    const updateCount = (cart) => setCartCount(Number(cart?.itemCount || 0));
    api.get("/customer/cart").then((response) => { if (active) updateCount(response.data.data); }).catch(() => { if (active) updateCount(null); });
    const onCartUpdated = (event) => updateCount(event.detail);
    window.addEventListener("foodiehub:cart-updated", onCartUpdated);
    return () => { active = false; window.removeEventListener("foodiehub:cart-updated", onCartUpdated); };
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => api.get("/customer/notifications", { params: { page: 1, limit: 1 } }).then((response) => { if (active) setUnreadCount(Number(response.data.data.unreadCount || 0)); }).catch(() => {});
    refresh();
    const disconnect = connectCustomerNotificationSocket(() => { if (active) setUnreadCount((count) => count + 1); });
    const onRead = () => refresh();
    window.addEventListener("foodiehub:notifications-read", onRead);
    return () => { active = false; disconnect(); window.removeEventListener("foodiehub:notifications-read", onRead); };
  }, []);
  return (
    <div className="min-h-screen bg-[#F7F8FC] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col bg-[#171B2D] lg:flex">
        <Sidebar signOut={signOut} setMobileOpen={setMobileOpen} cartCount={cartCount} unreadCount={unreadCount} homeTarget={homePath(user)} />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/60"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-[#171B2D] shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-5 z-10 p-2 text-slate-400"
            >
              <X size={20} />
            </button>
            <Sidebar signOut={signOut} setMobileOpen={setMobileOpen} cartCount={cartCount} unreadCount={unreadCount} homeTarget={homePath(user)} />
          </aside>
        </div>
      )}
      <div className="min-h-screen lg:ml-[260px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={21} />
            </button>
            <div>
              <p className="text-sm font-bold text-slate-800">
                Customer Dashboard
              </p>
              <p className="text-xs text-slate-400">Good food, made easier.</p>
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setProfileOpen((value) => !value)}
              className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 font-bold text-orange-700">
                {name.charAt(0).toUpperCase()}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-40 truncate text-xs font-bold text-slate-800">
                  {name}
                </span>
                <span className="block text-[10px] text-slate-400">
                  Customer
                </span>
              </span>
              <ChevronDown size={15} className="text-slate-400" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 w-48 rounded-xl border border-slate-100 bg-white p-2 shadow-xl">
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    navigate("/customer/profile");
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                >
                  My Profile
                </button>
                <button
                  onClick={signOut}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto min-h-[calc(100vh-132px)] max-w-[1500px] p-5 sm:p-8">
          <Outlet />
        </main>
        <footer className="border-t border-slate-200 px-6 py-4 text-center text-xs text-slate-400">
          © 2026 FoodieHub. All rights reserved.
        </footer>
      </div>
    </div>
  );
}

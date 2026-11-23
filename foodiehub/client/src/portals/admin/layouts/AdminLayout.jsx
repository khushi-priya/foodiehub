
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import {
  LayoutDashboard,
  Store,
  GitBranch,
  Utensils,
  Users,
  ShoppingBag,
  Truck,
  CreditCard,
  TicketPercent,
  Wallet,
  BarChart3,
  Settings,
  Headphones,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '../../../context/AuthContext';
import { connectAdminNotificationSocket } from '../../../services/socket';

const navigation = [
  {
    title: 'OVERVIEW',
    items: [
      {
        label: 'Dashboard',
        path: '/admin/dashboard',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: 'PLATFORM MANAGEMENT',
    items: [
      {
        label: 'Restaurants',
        path: '/admin/restaurants',
        icon: Store,
      },
      { label: 'Branches', path: '/admin/branches', icon: GitBranch },
      { label: 'Food Categories', path: '/admin/food-categories', icon: Utensils },
      { label: 'Category Requests', path: '/admin/category-requests', icon: TicketPercent },
      { label: 'All Food Items', path: '/admin/food-items', icon: ShoppingBag },
    ],
  },
  {
    title: 'BUSINESS & REVENUE',
    items: [
      { label: 'Customers', path: '/admin/customers', icon: Users },
      { label: 'Orders', path: '/admin/orders', icon: ShoppingBag },
      { label: 'Delivery Assignments', path: '/admin/delivery/assignments', icon: Truck },
      { label: 'Subscriptions', path: '/admin/subscriptions', icon: CreditCard },
      { label: 'Coupons', path: '/admin/coupons', icon: TicketPercent },
      { label: 'Commissions', path: '/admin/commissions', icon: Wallet },
      { label: 'Payments & COD', path: '/admin/payments', icon: CreditCard },
      { label: 'Reports & Analytics', path: '/admin/reports', icon: BarChart3 },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { label: 'Support & Complaints', path: '/admin/support', icon: Headphones },
      { label: 'Settings', path: '/admin/system', icon: Settings },
    ],
  },
];


export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => connectAdminNotificationSocket((event) => {
    setNotifications((current) => [event, ...current].slice(0, 8));
  }), []);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  const SidebarContent = () => (
    <>
      <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
          <Utensils size={21} />
        </div>

        {!collapsed && (
          <div className="min-w-0">
            <p className="text-lg font-bold tracking-tight text-white">
              FoodieHub
            </p>
            <p className="text-[10px] tracking-[0.15em] text-slate-400">
              SUPER ADMIN
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-6">
        {navigation.map((group) => (
          <div key={group.title} className="mb-7">
            {!collapsed && (
              <p className="mb-3 px-3 text-[10px] font-bold tracking-[0.16em] text-slate-500">
                {group.title}
              </p>
            )}

            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;

                if (!item.path) {
                  return (
                    <div
                      key={item.label}
                      title={collapsed ? `${item.label} · Coming soon` : undefined}
                      className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500/80"
                    >
                      <Icon size={19} className="shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          <span className="text-[9px] text-slate-600">SOON</span>
                        </>
                      )}
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={item.label}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                        isActive
                          ? 'bg-orange-500 text-white shadow-lg shadow-orange-950/20'
                          : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <Icon size={19} className="shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-sm font-bold text-orange-300">
            {user?.firstName?.charAt(0)?.toUpperCase()}
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[10px] text-slate-400">Super Administrator</p>
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 transition hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut size={19} />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F5F6FA]">

      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-[#171B2D] transition-all duration-300 lg:flex ${
          collapsed ? 'w-[82px]' : 'w-[265px]'
        }`}
      >
        <SidebarContent />

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-[88px] flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/60"
          />

          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-[#171B2D] shadow-2xl">
            <div className="absolute right-3 top-5 z-10">
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main workspace */}
      <div
        className={`min-h-screen transition-all duration-300 ${
          collapsed ? 'lg:ml-[82px]' : 'lg:ml-[265px]'
        }`}
      >
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-5 backdrop-blur-xl sm:px-8">

          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>

            <div>
              <p className="text-sm font-bold text-slate-800">
                Administration
              </p>
              <p className="text-xs text-slate-400">
                Manage your FoodieHub platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 xl:flex">
              <Search size={16} className="text-slate-400" />
              <span className="text-xs text-slate-400">
                Search coming soon
              </span>
            </div>

            <div className="relative">
              <button
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100"
                aria-label="Notifications"
                title="Notifications"
                aria-expanded={notificationsOpen}
              >
                <Bell size={20} />
                {notifications.length > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-orange-500 px-1 text-center text-[10px] font-bold leading-5 text-white">{notifications.length}</span>}
              </button>
              {notificationsOpen && <div className="absolute right-0 top-12 z-40 w-[min(90vw,360px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><p className="text-sm font-bold text-slate-800">Live notifications</p><button onClick={() => setNotifications([])} className="text-xs font-semibold text-orange-600">Clear</button></div>
                {notifications.length ? <ul className="max-h-96 divide-y divide-slate-100 overflow-auto">{notifications.map((item) => <li key={item.id}><button onClick={() => { setNotificationsOpen(false); if (item.href) navigate(item.href); }} className="w-full px-4 py-3 text-left hover:bg-slate-50"><span className="block text-sm font-semibold text-slate-800">{item.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.message}</span><span className="mt-1 block text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</span></button></li>)}</ul> : <p className="p-5 text-center text-sm text-slate-400">No live notifications.</p>}
                <div className="border-t border-slate-100 p-3"><button onClick={() => { setNotificationsOpen(false); navigate('/admin/system?tab=audit'); }} className="text-xs font-semibold text-orange-600">Open audit logs</button><p className="mt-1 text-[10px] text-slate-400">Notifications arrive while you are connected.</p></div>
              </div>}
            </div>

            <div className="hidden h-8 w-px bg-slate-200 sm:block" />

            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-sm font-bold text-orange-600">
                {user?.firstName?.charAt(0)?.toUpperCase()}
              </div>

              <div className="hidden sm:block">
                <p className="text-xs font-bold text-slate-800">
                  {user?.firstName} {user?.lastName}
                </p>
                <div className="flex items-center gap-1">
                  <ShieldCheck size={11} className="text-emerald-600" />
                  <p className="text-[10px] text-slate-400">
                    Super Admin
                  </p>
                </div>
              </div>

              <ChevronDown size={15} className="hidden text-slate-400 sm:block" />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] p-5 sm:p-8">
          <Outlet />
        </main>

        <footer className="border-t border-slate-200/80 px-8 py-5 text-center text-xs text-slate-400">
          © 2026 FoodieHub. All rights reserved.
        </footer>
      </div>
    </div>
  );
}

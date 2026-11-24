import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import {
  LayoutDashboard,
  ShoppingBag,
  ChefHat,
  ConciergeBell,
  Utensils,
  Users,
  Table2,
  CalendarDays,
  GitBranch,
  Settings,
  Headphones,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  Store,
  Tags,
  CreditCard,
  TicketPercent,
  Clock3,
  Truck,
  PackageCheck,
  UserRound,
  ShieldCheck as ShieldPermissions,
  ClipboardList,
  MapPinned,
  SlidersHorizontal,
  ChartNoAxesCombined,
  Boxes,
  Banknote,
  Receipt,
  RotateCcw,
} from "lucide-react";

import { useAuth } from "../../../context/AuthContext";
import RestaurantHeaderTools from "../components/RestaurantHeaderTools";

const navigation = [
  {
    title: "OVERVIEW",
    items: [
      {
        label: "Dashboard",
        path: "/restaurant/dashboard",
        icon: LayoutDashboard,
        permission: "restaurant.dashboard.view",
      },
    ],
  },
  {
    title: "RESTAURANT MANAGEMENT",
    items: [
      {
        label: "Branches",
        path: "/restaurant/branches",
        icon: GitBranch,
        permission: "branches.view",
      },
      {
        label: "Category",
        path: "/restaurant/categories",
        permission: "menu.view",
        icon: Tags,
      },
      {
        label: "Food Menu",
        path: "/restaurant/menu",
        icon: Utensils,
        permission: "menu.view",
      },
      {
        label: "Tables",
        path: "/restaurant/tables",
        icon: Table2,
        permission: "tables.view",
      },
      {
        label: "Reservations",
        path: "/restaurant/reservations",
        icon: CalendarDays,
        permission: ["reservations.view", "reservations.manage"],
      },
      {
        label: "Inventory",
        path: "/restaurant/inventory",
        icon: Boxes,
        permission: "inventory.view",
      },
      {
        label: "POS & billing",
        path: "/restaurant/pos",
        icon: CreditCard,
        permission: "pos.access",
      },
      {
        label: "Orders",
        path: "/restaurant/orders",
        icon: ShoppingBag,
        permission: "orders.view",
      },
      {
        label: "Kitchen display",
        path: "/restaurant/kitchen",
        icon: ChefHat,
        permission: "orders.kitchen",
      },
      {
        label: "Waiter service",
        path: "/restaurant/waiter",
        icon: ConciergeBell,
        permission: "orders.manage",
      },
    ],
  },
  {
    title: "TEAM & BUSINESS",
    items: [
      {
        label: "Plans & billing",
        path: "/restaurant/subscription",
        icon: CreditCard,
        permission: "subscriptions.view",
      },
      {
        label: "Coupons",
        path: "/restaurant/coupons",
        icon: TicketPercent,
        permission: "coupons.manage",
      },
      {
        label: "Employees",
        path: "/restaurant/employees",
        icon: Users,
        permission: "employees.view",
      },
      {
        label: "Attendance",
        path: "/restaurant/attendance",
        icon: Clock3,
        permission: ["attendance.view", "attendance.check_in"],
      },
      {
        label: "Settings",
        path: "/restaurant/settings",
        icon: Settings,
        permission: "business.view",
      },
    ],
  },
  {
    title: "PAYMENTS & SETTLEMENTS",
    collapsible: true,
    icon: CreditCard,
    items: [
      { label: "Payment Overview", path: "/restaurant/payments", icon: ChartNoAxesCombined, permission: "payments.view" },
      { label: "Transactions", path: "/restaurant/payments/transactions", icon: Receipt, permission: "payments.transactions.view" },
      { label: "COD Collections", path: "/restaurant/payments/cod-collections", icon: Truck, permission: "payments.cod.view" },
      { label: "Cash Reconciliation", path: "/restaurant/payments/cash-reconciliation", icon: Banknote, permission: "payments.cash_reconcile" },
      { label: "Settlements", path: "/restaurant/payments/settlements", icon: ClipboardList, permission: "payments.settlements.view" },
      { label: "Refunds", path: "/restaurant/payments/refunds", icon: RotateCcw, permission: "payments.refunds.view" },
    ],
  },
  {
    title: "DELIVERY MANAGEMENT",
    collapsible: true,
    icon: Truck,
    items: [
      {
        label: "Delivery Dashboard",
        path: "/restaurant/delivery",
        icon: LayoutDashboard,
        ownerOnly: true,
      },
      {
        label: "Delivery Orders",
        path: "/restaurant/delivery/orders",
        icon: PackageCheck,
        permission: "delivery_orders.view",
      },
      {
        label: "Delivery Staff",
        path: "/restaurant/delivery/staff",
        icon: UserRound,
        ownerOnly: true,
      },
      {
        label: "Delivery Roles & Permissions",
        path: "/restaurant/delivery/roles",
        icon: ShieldPermissions,
        ownerOnly: true,
      },
      {
        label: "Delivery Assignments",
        path: "/restaurant/delivery/assignments",
        icon: ClipboardList,
        ownerOnly: true,
      },
      {
        label: "Live Delivery Map",
        path: "/restaurant/delivery/live-map",
        icon: MapPinned,
        ownerOnly: true,
      },
      {
        label: "Delivery Settings",
        path: "/restaurant/delivery/settings",
        icon: SlidersHorizontal,
        ownerOnly: true,
      },
      {
        label: "Delivery Reports",
        path: "/restaurant/delivery/reports",
        icon: ChartNoAxesCombined,
        ownerOnly: true,
      },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      {
        label: "Support",
        path: "/restaurant/support",
        icon: Headphones,
        permission: "support.view",
      },
    ],
  },
];

function getActiveMembership(user) {
  const memberships = user?.restaurantMemberships || [];

  return (
    memberships.find((membership) => {
      const role =
        typeof membership.role === "string"
          ? membership.role
          : membership.role?.code;

      return membership.status === "active" && role === "restaurant_owner";
    }) ||
    memberships.find((membership) => membership.status === "active") ||
    null
  );
}

export default function RestaurantLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(() =>
    location.pathname.startsWith("/restaurant/delivery"),
  );
  const [paymentsOpen, setPaymentsOpen] = useState(() => location.pathname.startsWith("/restaurant/payments"));

  const membership = useMemo(() => getActiveMembership(user), [user]);
  const membershipRole =
    typeof membership?.role === "string"
      ? membership.role
      : membership?.role?.code;
  const membershipPermissions = Array.isArray(membership?.role?.permissions)
    ? membership.role.permissions.map((permission) =>
        typeof permission === "string" ? permission : permission.code,
      )
    : [];
  const isRestaurantOwner = membershipRole === "restaurant_owner";
  const roleLabel =
    membership?.role?.name ||
    (membershipRole === "kitchen_staff"
      ? "Kitchen Staff"
      : membershipRole === "waiter"
        ? "Waiter"
        : "Restaurant Owner");
  const visibleNavigation = navigation
    .filter(
      (group) =>
        !group.collapsible ||
        isRestaurantOwner ||
        (group.title === "PAYMENTS & SETTLEMENTS"
          ? membershipPermissions.some((code) => code.startsWith("payments."))
          : membershipPermissions.some((code) => code.startsWith("delivery_"))),
    )
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.ownerOnly || isRestaurantOwner) &&
          (!item.permission ||
            isRestaurantOwner ||
            (Array.isArray(item.permission)
              ? item.permission.some((code) =>
                  membershipPermissions.includes(code),
                )
              : membershipPermissions.includes(item.permission))),
      ),
    }))
    .filter((group) => group.items.length);

  const restaurant = membership?.restaurant;
  const restaurantName =
    restaurant?.name || restaurant?.restaurantName || "My Restaurant";

  const firstName = user?.firstName || "Restaurant";
  const lastName = user?.lastName || "Owner";
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const SidebarContent = ({ isMobile = false }) => (
    <>
      <div className="flex h-[76px] shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
          <Utensils size={21} />
        </div>

        <div className="min-w-0">
          <p className="text-lg font-bold tracking-tight text-white">
            FoodieHub
          </p>
          <p className="truncate text-[10px] tracking-[0.15em] text-slate-400">
            RESTAURANT PORTAL
          </p>
        </div>
      </div>

      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-orange-300">
            <Store size={19} />
          </div>

          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">
              {restaurantName}
            </p>
            <p className="text-[10px] text-slate-400">Restaurant workspace</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-6">
        {visibleNavigation.map((group) => (
          <div key={group.title} className="mb-7">
            {group.collapsible ? (
              <>
                <button
                  type="button"
                  aria-expanded={group.title === "PAYMENTS & SETTLEMENTS" ? paymentsOpen : deliveryOpen}
                  aria-controls={group.title === "PAYMENTS & SETTLEMENTS" ? "restaurant-payments-navigation" : "restaurant-delivery-navigation"}
                  title={collapsed ? group.title : undefined}
                  onClick={() => {
                    if (collapsed) { setCollapsed(false); return; }
                    if (group.title === "PAYMENTS & SETTLEMENTS") setPaymentsOpen((open) => !open);
                    else setDeliveryOpen((open) => !open);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${location.pathname.startsWith(group.title === "PAYMENTS & SETTLEMENTS" ? "/restaurant/payments" : "/restaurant/delivery") ? "text-orange-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
                >
                  <group.icon size={19} className="shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">
                        {group.title === "PAYMENTS & SETTLEMENTS" ? "Payments & Settlements" : "Delivery Management"}
                      </span>
                      <ChevronDown
                        size={15}
                        className={`transition-transform ${(group.title === "PAYMENTS & SETTLEMENTS" ? paymentsOpen : deliveryOpen) ? "rotate-180" : ""}`}
                      />
                    </>
                  )}
                </button>
                {(group.title === "PAYMENTS & SETTLEMENTS" ? paymentsOpen : deliveryOpen) && !collapsed && (
                  <div
                    id={group.title === "PAYMENTS & SETTLEMENTS" ? "restaurant-payments-navigation" : "restaurant-delivery-navigation"}
                    className="mt-1 space-y-1 border-l border-white/10 pl-3 ml-5"
                  >
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={item.path === "/restaurant/delivery" || item.path === "/restaurant/payments"}
                          onClick={() => { setMobileOpen(false); if (group.title === "PAYMENTS & SETTLEMENTS") setPaymentsOpen(true); else setDeliveryOpen(true); }}
                          className={({ isActive }) =>
                            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition ${isActive ? "bg-orange-500 text-white shadow-lg shadow-orange-950/20" : "text-slate-400 hover:bg-white/5 hover:text-white"}`
                          }
                        >
                          <Icon size={16} className="shrink-0" />
                          <span>{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
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
                          title={
                            collapsed
                              ? `${item.label} · Coming soon`
                              : undefined
                          }
                          className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500/80"
                        >
                          <Icon size={19} className="shrink-0" />

                          {!collapsed && (
                            <>
                              <span className="flex-1">{item.label}</span>
                              <span className="text-[9px] text-slate-600">
                                SOON
                              </span>
                            </>
                          )}
                        </div>
                      );
                    }

                    return (
                      <NavLink
                        key={item.label}
                        to={item.path}
                        end
                        title={collapsed ? item.label : undefined}
                        onClick={() => {
                          setMobileOpen(false);
                        }}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                            isActive
                              ? "bg-orange-500 text-white shadow-lg shadow-orange-950/20"
                              : "text-slate-400 hover:bg-white/5 hover:text-white"
                          }`
                        }
                      >
                        <Icon size={19} className="shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
                      </NavLink>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-sm font-bold text-orange-300">
            {initials}
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">
                {firstName} {lastName}
              </p>
              <p className="text-[10px] text-slate-400">{roleLabel}</p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 transition hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut size={19} />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-[#171B2D] transition-all duration-300 lg:flex ${
          collapsed ? "w-[82px]" : "w-[265px]"
        }`}
      >
        <SidebarContent />

        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
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
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/60"
          />

          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-[#171B2D] shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-5 z-10 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>

            <SidebarContent isMobile />
          </aside>
        </div>
      )}

      {/* Main workspace */}
      <div
        className={`min-h-screen transition-all duration-300 ${
          collapsed ? "lg:ml-[82px]" : "lg:ml-[265px]"
        }`}
      >
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>

            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">
                Restaurant Workspace
              </p>
              <p className="truncate text-xs text-slate-400">
                Manage {restaurantName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-5">
            <RestaurantHeaderTools />

            <div className="hidden h-8 w-px bg-slate-200 sm:block" />

            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-sm font-bold text-orange-600">
                {initials}
              </div>

              <div className="hidden sm:block">
                <p className="text-xs font-bold text-slate-800">
                  {firstName} {lastName}
                </p>
                <div className="flex items-center gap-1">
                  <ShieldCheck size={11} className="text-emerald-600" />
                  <p className="text-[10px] text-slate-400">{roleLabel}</p>
                </div>
              </div>

              <ChevronDown
                size={15}
                className="hidden text-slate-400 sm:block"
              />
            </div>
          </div>
        </header>

        <main className="mx-auto min-h-[calc(100vh-140px)] w-full max-w-[1600px] p-5 sm:p-8">
          <Outlet />
        </main>

        <footer className="border-t border-slate-200/80 px-8 py-5 text-center text-xs text-slate-400">
          © 2026 FoodieHub. All rights reserved.
        </footer>
      </div>
    </div>
  );
}

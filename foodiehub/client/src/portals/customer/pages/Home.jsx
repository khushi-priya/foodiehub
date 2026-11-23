
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChefHat,
  Clock3,
  MapPin,
  Menu,
  ShieldCheck,
  ShoppingBag,
  Store,
  Utensils,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { homePath, useAuth } from '../../../context/AuthContext';

const COPYRIGHT_YEAR = new Date().getFullYear();

const features = [
  {
    icon: Store,
    title: 'Manage your restaurant',
    description:
      'Manage branches, employees, menus and daily restaurant operations from one dashboard.',
  },
  {
    icon: ShoppingBag,
    title: 'Receive online orders',
    description:
      'Connect your restaurant to the FoodieHub marketplace and reach more customers.',
  },
  {
    icon: Zap,
    title: 'Simplify operations',
    description:
      'Manage orders, billing, kitchen operations and payments in one place.',
  },
];

export default function Home() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [restaurants, setRestaurants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const homeTarget = user ? homePath(user) : '/';

  useEffect(() => {
    let active = true;
    api.get('/public/restaurants', { params: { limit: 3 } })
      .then((response) => {
        if (!active) return;
        setRestaurants(response.data.data.restaurants || []);
        setCategories(response.data.data.filters?.categories || []);
      })
      .catch((error) => {
        if (active) setMarketError(error.response?.data?.message || 'Restaurants could not be loaded.');
      })
      .finally(() => { if (active) setMarketLoading(false); });
    return () => { active = false; };
  }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    navigate(`/restaurants${searchTerm.trim() ? `?search=${encodeURIComponent(searchTerm.trim())}` : ''}`);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link to={homeTarget} className="flex items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-200">
              <Utensils size={23} />
            </div>

            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">
                Foodie<span className="text-orange-500">Hub</span>
              </h1>
              <p className="text-[10px] font-semibold uppercase tracking-[2px] text-slate-400">
                Food. Business. Together.
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {user ? <Link to={homeTarget} className="text-sm font-semibold text-slate-700 transition hover:text-orange-500">Home</Link> : <a href="#home" className="text-sm font-semibold text-slate-700 transition hover:text-orange-500">Home</a>}
            <a
              href="#features"
              className="text-sm font-semibold text-slate-700 transition hover:text-orange-500"
            >
              Features
            </a>
            <a
              href="#restaurants"
              className="text-sm font-semibold text-slate-700 transition hover:text-orange-500"
            >
              Restaurants
            </a>
            <a
              href="#partners"
              className="text-sm font-semibold text-slate-700 transition hover:text-orange-500"
            >
              For Restaurant Owners
            </a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              to="/login"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Sign in
            </Link>

            <Link
              to="/restaurant/register"
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:-translate-y-0.5 hover:bg-orange-600"
            >
              Register Restaurant
              <ArrowRight size={16} />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-xl border border-slate-200 p-2.5 text-slate-700 md:hidden"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-slate-100 bg-white px-5 py-5 md:hidden">
            <nav className="flex flex-col gap-4">
              {user ? <Link to={homeTarget} onClick={() => setMobileMenuOpen(false)}>Home</Link> : <a href="#home" onClick={() => setMobileMenuOpen(false)}>Home</a>}
              <a href="#features" onClick={() => setMobileMenuOpen(false)}>
                Features
              </a>
              <a href="#restaurants" onClick={() => setMobileMenuOpen(false)}>
                Restaurants
              </a>
              <a href="#partners" onClick={() => setMobileMenuOpen(false)}>
                For Restaurant Owners
              </a>
              <Link to="/login" className="font-semibold">
                Sign in
              </Link>
              <Link
                to="/restaurant/register"
                className="rounded-xl bg-orange-500 px-5 py-3 text-center font-bold text-white"
              >
                Register Your Restaurant
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <main>
        <section
          id="home"
          className="relative overflow-hidden bg-orange-50"
        >
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-orange-200/40 blur-3xl" />
          <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-yellow-200/40 blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-2 lg:px-10">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-700 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Your food and restaurant partner
              </div>

              <h2 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Hungry?
                <br />
                Order from restaurants
                <br />
                <span className="text-orange-500">
                  you love.
                </span>
              </h2>

              <p className="mt-6 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                Discover approved restaurants, explore real menus, and choose the location that works for you.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#restaurants"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-7 py-4 font-bold text-white shadow-xl shadow-orange-200 transition hover:-translate-y-1 hover:bg-orange-600"
                >
                  Explore FoodieHub
                  <ArrowRight size={18} />
                </a>

                <Link
                  to="/restaurant/register"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-7 py-4 font-bold text-slate-800 transition hover:border-orange-300 hover:text-orange-600"
                >
                  <Store size={18} />
                  Register Your Restaurant
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap gap-6">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <CheckCircle2 className="text-green-600" size={18} />
                  Easy restaurant management
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <CheckCircle2 className="text-green-600" size={18} />
                  One connected platform
                </div>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -right-5 -top-5 h-32 w-32 rounded-full bg-orange-300/50 blur-2xl" />

              <div className="relative overflow-hidden rounded-[2rem] border-8 border-white shadow-2xl shadow-orange-200/60">
                <img
                  src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200"
                  alt="A table filled with delicious food"
                  className="h-[350px] w-full object-cover sm:h-[450px]"
                />

                <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                        <ChefHat size={25} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">
                          Your restaurant, your business
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Manage everything in one place
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="text-orange-500" />
                  </div>
                </div>
              </div>

              <div className="absolute -left-5 top-12 hidden rounded-2xl bg-white p-4 shadow-xl sm:block">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-green-100 p-3 text-green-600">
                    <ShoppingBag size={22} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Online ordering
                    </p>
                    <p className="text-xs text-slate-500">
                      Made simple
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits strip */}
        <section className="border-b border-slate-100 bg-white">
          <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:grid-cols-3 sm:px-8 lg:px-10">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-orange-50 p-3 text-orange-500">
                <Utensils size={22} />
              </div>
              <div>
                <p className="font-bold">Food marketplace</p>
                <p className="text-sm text-slate-500">
                  Discover different restaurants
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-orange-50 p-3 text-orange-500">
                <Clock3 size={22} />
              </div>
              <div>
                <p className="font-bold">Simpler operations</p>
                <p className="text-sm text-slate-500">
                  Manage everyday activities
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-orange-50 p-3 text-orange-500">
                <ShieldCheck size={22} />
              </div>
              <div>
                <p className="font-bold">One connected platform</p>
                <p className="text-sm text-slate-500">
                  Customers and restaurants together
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Food discovery preview */}
        <section id="restaurants" className="bg-white py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="font-bold uppercase tracking-[2px] text-orange-500">
                  Explore FoodieHub
                </p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Something delicious awaits
                </h2>
                <p className="mt-3 max-w-xl text-slate-500">
                  Browse approved restaurants and explore their menus, all connected to live FoodieHub listings.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
                <MapPin size={17} className="text-orange-500" />
                Explore available locations
              </div>
            </div>

            <form onSubmit={submitSearch} className="mt-7 flex max-w-2xl flex-col gap-3 sm:flex-row">
              <label className="flex flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <MapPin size={18} className="shrink-0 text-orange-500" />
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search restaurants, food or city" className="w-full bg-transparent text-sm outline-none" />
              </label>
              <button className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600">Find restaurants</button>
            </form>

            {categories.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{categories.slice(0, 10).map((category) => <button key={category.id} onClick={() => navigate(`/restaurants?category=${encodeURIComponent(category.id)}`)} className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100">{category.name}</button>)}</div>}

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {restaurants.map((restaurant) => (
                <article
                  key={restaurant.id}
                  className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="flex h-48 items-center justify-center overflow-hidden bg-orange-50">
                    {restaurant.logo ? <img src={restaurant.logo} alt={`${restaurant.name} logo`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" /> : <Store size={44} className="text-orange-300" />}
                  </div>

                  <div className="p-5">
                    <h3 className="text-xl font-bold">{restaurant.name}</h3>
                    {restaurant.branches?.some((branch) => branch.approvalStatus === 'pending') && <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">Pending Approval · Development Test</span>}
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">{restaurant.description || restaurant.cities?.join(', ') || 'Restaurant details available on the menu page.'}</p>
                    <div className="mt-5 flex items-center justify-between">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${restaurant.isOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{restaurant.isOpen ? 'Open now' : 'Closed'}</span>
                      <span className="text-xs text-slate-500">{restaurant.averagePreparationTime ? `~${restaurant.averagePreparationTime} min prep` : 'Prep time unavailable'}</span>
                    </div>
                    <Link to={`/restaurants/${restaurant.slug}`} className="mt-4 block rounded-xl bg-orange-500 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-orange-600">View menu</Link>
                  </div>
                </article>
              ))}
            </div>
            {marketLoading && <p className="mt-8 text-center text-sm text-slate-500">Loading restaurants…</p>}
            {!marketLoading && !marketError && restaurants.length === 0 && <p className="mt-8 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">No restaurants are available yet. Check back soon.</p>}
            {marketError && <p role="alert" className="mt-8 rounded-xl bg-red-50 p-4 text-center text-sm text-red-700">{marketError}</p>}
            <div className="mt-8 text-center"><Link to="/restaurants" className="inline-flex items-center gap-2 rounded-xl border border-orange-200 px-5 py-3 text-sm font-bold text-orange-700 hover:bg-orange-50">Browse all restaurants<ArrowRight size={16}/></Link></div>
          </div>
        </section>

        {/* Restaurant partner section */}
        <section
          id="partners"
          className="overflow-hidden bg-slate-950 py-20 text-white"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:px-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-400/10 px-4 py-2 text-sm font-semibold text-orange-300">
                <Store size={16} />
                Restaurant Partner Program
              </div>

              <h2 className="mt-6 text-3xl font-extrabold leading-tight sm:text-5xl">
                Own a restaurant?
                <br />
                <span className="text-orange-400">
                  Let's grow together.
                </span>
              </h2>

              <p className="mt-6 max-w-xl leading-8 text-slate-300">
                Bring your restaurant to FoodieHub. Register your
                business, manage your branches and employees, organize
                your menu, and handle orders from one platform.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  'Register your restaurant online',
                  'Manage branches and employees',
                  'Control menus and food availability',
                  'Manage orders and daily operations',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2
                      size={19}
                      className="shrink-0 text-orange-400"
                    />
                    <span className="text-sm text-slate-200 sm:text-base">
                      {item}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/restaurant/register"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-7 py-4 font-bold text-white transition hover:bg-orange-600"
                >
                  Register Your Restaurant
                  <ArrowRight size={18} />
                </Link>

                <Link
                  to="/admin/login"
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 px-7 py-4 font-semibold text-white transition hover:bg-white/10"
                >
                  Super Admin Login
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-5 rounded-full bg-orange-500/20 blur-3xl" />
              <div className="relative overflow-hidden rounded-3xl border border-white/10">
                <img
                  src="https://images.unsplash.com/photo-1513104890138-7c749659a591?w=700"
                  alt="Restaurant interior"
                  className="h-[390px] w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                <div className="absolute bottom-0 p-7">
                  <p className="text-2xl font-bold">
                    Your restaurant journey starts here.
                  </p>
                  <p className="mt-2 text-sm text-slate-200">
                    One platform to manage your restaurant business.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="bg-slate-50 py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="mx-auto max-w-2xl text-center">
              <p className="font-bold uppercase tracking-[2px] text-orange-500">
                Why FoodieHub
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Everything connected in one place
              </h2>
              <p className="mt-4 text-slate-500">
                A single platform designed for restaurant owners,
                employees and food lovers.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;

                return (
                  <div
                    key={feature.title}
                    className="rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div className="inline-flex rounded-2xl bg-orange-50 p-4 text-orange-500">
                      <Icon size={27} />
                    </div>
                    <h3 className="mt-6 text-xl font-bold">
                      {feature.title}
                    </h3>
                    <p className="mt-3 leading-7 text-slate-500">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-center lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white">
              <Utensils size={21} />
            </div>
            <div>
              <p className="text-xl font-extrabold">
                Foodie<span className="text-orange-500">Hub</span>
              </p>
              <p className="text-xs text-slate-500">
                Food. Business. Together.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-500">
            <Link to={homeTarget} className="hover:text-orange-500">
              Home
            </Link>
            <Link
              to="/restaurant/register"
              className="hover:text-orange-500"
            >
              Register Restaurant
            </Link>
            <Link
              to="/admin/login"
              className="hover:text-orange-500"
            >
              Super Admin
            </Link>
          </div>

          <p className="text-sm text-slate-400">
            © {COPYRIGHT_YEAR} FoodieHub. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

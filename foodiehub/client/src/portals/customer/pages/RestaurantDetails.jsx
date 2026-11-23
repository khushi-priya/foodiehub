import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock3,
  LoaderCircle,
  MapPin,
  Phone,
  Store,
  Utensils,
  Heart,
  Download,
  ExternalLink,
  QrCode,
  Share2,
  X,
} from "lucide-react";
import { api } from "../../../services/api";
import { getUserRoles, homePath, useAuth } from "../../../context/AuthContext";
import FoodItemDetails from "../components/FoodItemDetails";
import CustomerReservationForm from "../components/CustomerReservationForm";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(value || 0));
const showTime = (value) => (value ? String(value).slice(0, 5) : "—");

export default function RestaurantDetails() {
  const { user } = useAuth();
  const { slug } = useParams();
  const homeTarget = user ? homePath(user) : "/";
  const [params, setParams] = useSearchParams();
  const requestedBranchId = params.get("branchId");
  const [restaurant, setRestaurant] = useState(null);
  const [branches, setBranches] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dietaryFilter, setDietaryFilter] = useState("");
  const [excludedAllergens, setExcludedAllergens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedBranch, setSelectedBranch] = useState(
    params.get("branchId") || "",
  );
  const [selectedItem, setSelectedItem] = useState(null);
  const [activeCategory, setActiveCategory] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [qrModal, setQrModal] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState("");
  const [qrNotice, setQrNotice] = useState("");
  const [qrData, setQrData] = useState(null);
  const [serviceType, setServiceType] = useState("");
  const [dineInTables, setDineInTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tableError, setTableError] = useState("");
  const [selectedDineInTable, setSelectedDineInTable] = useState(null);
  const [confirmedDineInTableId, setConfirmedDineInTableId] = useState("");
  const [tableSelecting, setTableSelecting] = useState("");
  const [reservationOpen, setReservationOpen] = useState(
    params.get("book") === "1",
  );
  const [reservationNotice, setReservationNotice] = useState("");
  const visibleCategories = useMemo(() => categories.map((category) => ({
    ...category,
    items: (category.items || []).filter((item) =>
      (!dietaryFilter || (item.dietaryTags || []).includes(dietaryFilter)) &&
      excludedAllergens.every((allergen) => !(item.allergenTags || []).includes(allergen))),
  })).filter((category) => category.items.length), [categories, dietaryFilter, excludedAllergens]);

  async function loadBranchQr() {
    if (!selectedBranch) return;
    setQrModal(true);
    setQrLoading(true);
    setQrError("");
    setQrNotice("");
    setQrData(null);
    try {
      const response = await api.get(
        `/public/restaurants/${encodeURIComponent(slug)}/branches/${encodeURIComponent(selectedBranch)}/qr`,
      );
      setQrData(response.data.data);
    } catch (requestError) {
      setQrError(
        requestError.response?.data?.message ||
        "The QR code could not be loaded.",
      );
    } finally {
      setQrLoading(false);
    }
  }

  async function shareBranchQr() {
    if (!qrData) return;
    setQrNotice("");
    try {
      if (navigator.share) {
        const shareData = {
          title: `${restaurant.name} · ${qrData.branchName} menu`,
          text: "Open this restaurant's digital menu.",
          url: qrData.qrUrl,
        };
        if (navigator.canShare && typeof File !== "undefined") {
          const imageBlob = await fetch(qrData.imageDataUrl).then((response) =>
            response.blob(),
          );
          const imageFile = new File([imageBlob], qrData.downloadName, {
            type: "image/png",
          });
          if (navigator.canShare({ files: [imageFile] }))
            shareData.files = [imageFile];
        }
        await navigator.share(shareData);
        setQrNotice("QR code shared.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(qrData.qrUrl);
        setQrNotice("Digital menu link copied. You can share it with anyone.");
      } else {
        setQrNotice(
          "Sharing is unavailable here. Copy the digital menu link below.",
        );
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError")
        setQrError(
          "Sharing failed. You can download the QR code or open the menu link.",
        );
    }
  }
  async function saveRestaurant() {
    setSaveMessage("");
    try {
      await api.post("/customer/wishlist", {
        type: "restaurant",
        restaurantId: restaurant.id,
      });
      setSaved(true);
    } catch (error) {
      setSaveMessage(
        error.response?.data?.message ||
        "Sign in as a customer to save this restaurant.",
      );
    }
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api.get(`/public/restaurants/${slug}`),
      api.get(`/public/restaurants/${slug}/branches`),
    ])
      .then(([info, branchResponse]) => {
        if (!active) return;
        const restaurantData = info.data.data;
        const branchData = branchResponse.data.data || [];
        setRestaurant(restaurantData);
        setBranches(branchData);
        const chosen = branchData.some(
          (branch) => branch.id === requestedBranchId,
        )
          ? requestedBranchId
          : branchData.find((branch) => branch.isPrimary)?.id ||
          branchData[0]?.id ||
          "";
        setSelectedBranch(chosen);
      })
      .catch((requestError) => {
        if (active)
          setError(
            requestError.response?.data?.message ||
            "Restaurant details could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, requestedBranchId]);
  useEffect(() => {
    if (params.get("book") === "1" && restaurant) setReservationOpen(true);
  }, [params, restaurant]);
  useEffect(() => {
    if (!selectedBranch || !restaurant) return undefined;
    let active = true;
    setMenuLoading(true);
    const query = new URLSearchParams({ branchId: selectedBranch });
    api
      .get(`/public/restaurants/${slug}/menu?${query}`)
      .then((response) => {
        if (!active) return;
        setCategories(response.data.data || []);
        setActiveCategory((current) =>
          current &&
            response.data.data.some((category) => category.id === current)
            ? current
            : response.data.data[0]?.id || "",
        );
      })
      .catch((requestError) => {
        if (active)
          setError(
            requestError.response?.data?.message || "Menu could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setMenuLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, selectedBranch, restaurant]);
  useEffect(() => {
    if (!qrModal) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setQrModal(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [qrModal]);
  const branch = useMemo(
    () => branches.find((item) => item.id === selectedBranch),
    [branches, selectedBranch],
  );
  function chooseBranch(id) {
    setServiceType("");
    setDineInTables([]);
    setSelectedDineInTable(null);
    setConfirmedDineInTableId("");
    setTableError("");
    setSelectedBranch(id);
    const next = new URLSearchParams(params);
    next.set("branchId", id);
    setParams(next, { replace: true });
  }
  function rememberServicePreference(orderType) {
    setServiceType(orderType);
    try {
      sessionStorage.setItem(
        "foodiehub-order-preference",
        JSON.stringify({
          restaurantId: restaurant.id,
          branchId: selectedBranch,
          orderType,
        }),
      );
    } catch {
      /* checkout still lets the customer choose */
    }
  }
  useEffect(() => {
    if (
      serviceType !== "dine_in" ||
      !selectedBranch ||
      !branch?.dineInEnabled
    ) {
      setDineInTables([]);
      return undefined;
    }
    let active = true;
    setTablesLoading(true);
    setTableError("");
    api
      .get(
        `/public/restaurants/${encodeURIComponent(slug)}/branches/${encodeURIComponent(selectedBranch)}/tables`,
      )
      .then((response) => {
        if (active) setDineInTables(response.data.data || []);
      })
      .catch((requestError) => {
        if (active)
          setTableError(
            requestError.response?.data?.message ||
            "Dine-in tables could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setTablesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, selectedBranch, serviceType, branch?.dineInEnabled]);
  async function selectDineInTable(tableId) {
    setTableSelecting(tableId);
    setTableError("");
    setConfirmedDineInTableId("");
    setSelectedDineInTable(null);
    try {
      const response = await api.post(
        `/public/restaurants/${encodeURIComponent(slug)}/branches/${encodeURIComponent(selectedBranch)}/tables/${encodeURIComponent(tableId)}/select`,
      );
      setSelectedDineInTable(response.data.data);
    } catch (requestError) {
      setSelectedDineInTable(null);
      setTableError(
        requestError.response?.data?.message ||
        "That table is no longer available for online ordering.",
      );
    } finally {
      setTableSelecting("");
    }
  }
  function confirmDineInTable() {
    if (!selectedDineInTable?.table?.id) return;
    setConfirmedDineInTableId(selectedDineInTable.table.id);
    rememberServicePreference("dine_in");
  }
  if (loading)
    return (
      <div className="min-h-screen bg-[#fffaf6] px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-6 w-40 rounded-lg bg-orange-100" />
          <div className="grid gap-5 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:grid-cols-[180px_1fr] sm:p-8">
            <div className="h-44 w-44 rounded-3xl bg-slate-100" />
            <div className="space-y-4 py-2"><div className="h-8 w-2/3 rounded-lg bg-slate-100"/><div className="h-4 w-full max-w-xl rounded bg-slate-100"/><div className="h-4 w-4/5 max-w-lg rounded bg-slate-100"/><div className="flex gap-3 pt-3"><div className="h-11 w-32 rounded-xl bg-orange-100"/><div className="h-11 w-32 rounded-xl bg-slate-100"/></div></div>
          </div>
          <div className="grid gap-4 md:grid-cols-3"><div className="h-32 rounded-2xl bg-white"/><div className="h-32 rounded-2xl bg-white"/><div className="h-32 rounded-2xl bg-white"/></div>
          <div className="flex min-h-[35vh] items-center justify-center"><LoaderCircle className="animate-spin text-orange-500" /></div>
        </div>
      </div>
    );
  if (error && !restaurant)
    return (
      <main className="min-h-screen bg-[#fffaf6] p-6">
        <Link to="/restaurants" className="text-sm text-orange-700">
          ← All restaurants
        </Link>
        <p
          role="alert"
          className="mx-auto mt-10 max-w-xl rounded-xl bg-red-50 p-5 text-center text-sm text-red-700"
        >
          {error}
        </p>
      </main>
    );
  if (!restaurant) return null;
  return (
    <main className="min-h-screen bg-[#fffaf6] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link to={homeTarget} aria-label="FoodieHub home" className="flex items-center gap-2 font-extrabold text-xl">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-white"><Utensils size={18}/></span>
            Foodie<span className="text-orange-500">Hub</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to={homeTarget} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Home</Link>
            {getUserRoles(user).includes("customer") && <Link to="/customer/cart" className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cart</Link>}
            {!user && <Link to="/customer/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Sign in</Link>}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        <Link
          to="/restaurants"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
        >
          <ArrowLeft size={15} />
          All restaurants
        </Link>
        <section className="mt-5 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
          <div className="relative flex min-h-52 items-center justify-center overflow-hidden bg-gradient-to-br from-orange-100 via-orange-50 to-amber-100 p-7 sm:min-h-60">
            <div className="pointer-events-none absolute -left-12 -top-16 h-48 w-48 rounded-full bg-white/50 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-10 h-56 w-56 rounded-full bg-orange-300/25 blur-3xl" />
            {restaurant.logo ? (
              <img
                src={restaurant.logo}
                alt={`${restaurant.name} logo`}
                className="relative h-36 w-36 rounded-3xl border border-white/70 bg-white/90 object-contain p-3 shadow-xl sm:h-44 sm:w-44"
              />
            ) : (
              <div className="relative flex h-36 w-36 items-center justify-center rounded-3xl border border-white/70 bg-white/80 text-orange-300 shadow-xl sm:h-44 sm:w-44"><Store size={58} /></div>
            )}
          </div>
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_330px] lg:p-8">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{restaurant.name}</h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${restaurant.acceptingOrders !== false && restaurant.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${restaurant.acceptingOrders !== false && restaurant.isOpen ? "bg-emerald-500" : "bg-slate-400"}`} />
                  {restaurant.acceptingOrders === false
                    ? "Not accepting orders"
                    : restaurant.isOpen
                      ? "Open now"
                      : "Closed"}
                </span>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                {restaurant.description ||
                  "Restaurant description unavailable."}
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <a
                  href="#restaurant-menu"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50"
                >
                  View menu
                </a>
                <a
                  href="#restaurant-menu"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-500 px-5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-orange-600"
                >
                  Order online
                </a>
                {branches.some((item) => item.dineInEnabled) && (
                  <button
                    type="button"
                    onClick={() => setReservationOpen(true)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-4 text-sm font-bold text-orange-700 transition hover:bg-orange-50"
                  >
                    <Clock3 size={16} />
                    Book a Table
                  </button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={saveRestaurant}
                  disabled={saved}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-pink-200 bg-white px-4 py-2 text-sm font-bold text-pink-700 transition hover:bg-pink-50 disabled:opacity-60"
                >
                  <Heart size={16} />
                  {saved ? "Saved to wishlist" : "Save restaurant"}
                </button>
                {saveMessage && (
                  <span className="text-xs text-slate-500">
                    {saveMessage}{" "}
                    <Link
                      to="/customer/login"
                      className="font-bold text-orange-600 underline"
                    >
                      Sign in
                    </Link>
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Cuisine and rating details are not available yet.
              </p>
            </div>
            {branch && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Selected branch
                </p>
                <p className="mt-2 text-lg font-extrabold text-slate-900">{branch.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {[
                    branch.addressLine,
                    branch.addressLine2,
                    branch.landmark,
                    branch.city,
                    branch.state,
                    branch.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock3 size={13} />
                  {showTime(branch.openingTime)}–{showTime(branch.closingTime)}
                  {branch.overnight ? " · overnight" : ""} · {branch.timeZone}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Phone size={13} />
                  {branch.phone}
                </p>
                <button
                  type="button"
                  onClick={loadBranchQr}
                  disabled={qrLoading}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-3 text-sm font-bold text-orange-700 transition hover:bg-orange-50 disabled:opacity-60"
                >
                  <QrCode size={16} />
                  View QR Code
                </button>
              </div>
            )}
          </div>
        </section>
        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Choose your location</h2>
              <p className="mt-1 text-sm text-slate-500">
                Choose a location to view its services and operating hours.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200">
              {branches.length} {branches.length === 1 ? "location" : "locations"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {branches.map((item) => (
              <button
                key={item.id}
                onClick={() => chooseBranch(item.id)}
                aria-pressed={selectedBranch === item.id}
                className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selectedBranch === item.id ? "border-orange-400 ring-2 ring-orange-100" : "border-slate-200 hover:border-orange-200"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-bold text-slate-800">{item.name}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {item.isOpen ? "Open" : "Closed"}
                  </span>
                </div>
                {item.approvalStatus === "pending" && (
                  <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                    Pending Approval · Development Test
                  </span>
                )}
                <p className="mt-2 flex gap-1.5 text-sm text-slate-500">
                  <MapPin size={15} className="mt-0.5 shrink-0" />
                  {[
                    item.addressLine,
                    item.addressLine2,
                    item.city,
                    item.state,
                    item.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock3 size={13} />
                  {showTime(item.openingTime)}–{showTime(item.closingTime)}{" "}
                  {item.overnight ? "overnight" : ""} · {item.timeZone}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.deliveryEnabled && (
                    <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold text-orange-700">
                      Delivery
                    </span>
                  )}
                  {item.takeawayEnabled && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                      Takeaway
                    </span>
                  )}
                  {item.dineInEnabled && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                      Dine-in
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
        {branch && (
          <section
            aria-labelledby="service-choice-title"
            className="mt-8 scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="service-choice-title" className="text-xl font-extrabold tracking-tight text-slate-900">
                  How would you like to order?
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Services shown are configured for {branch.name}.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${restaurant.acceptingOrders !== false && branch.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                {restaurant.acceptingOrders === false
                  ? "This restaurant is not accepting new orders right now"
                  : branch.isOpen
                    ? "Accepting orders now"
                    : "Branch is currently closed"}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ["delivery", "Delivery", branch.deliveryEnabled],
                ["takeaway", "Takeaway", branch.takeawayEnabled],
                ["dine_in", "Dine-in", branch.dineInEnabled],
              ]
                .filter((service) => service[2])
                .map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={serviceType === value}
                    onClick={() => {
                      setServiceType(value);
                      if (value !== "dine_in") {
                        setSelectedDineInTable(null);
                        setConfirmedDineInTableId("");
                        setTableError("");
                        try {
                          sessionStorage.setItem(
                            "foodiehub-order-preference",
                            JSON.stringify({
                              restaurantId: restaurant.id,
                              branchId: selectedBranch,
                              orderType: value,
                            }),
                          );
                        } catch {
                          /* checkout remains available */
                        }
                      } else {
                        setSelectedDineInTable(null);
                        setConfirmedDineInTableId("");
                        setTableError("");
                      }
                    }}
                    className={`min-h-12 rounded-xl px-5 text-sm font-bold shadow-sm transition ${serviceType === value ? "bg-orange-500 text-white shadow-orange-500/20" : "border border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50"}`}
                  >
                    {label}
                  </button>
                ))}
            </div>
            {!serviceType && (
              <p className="mt-2 text-xs text-slate-500">
                Choose a service to set your preference. Checkout will confirm
                it before placing the order.
              </p>
            )}
            {serviceType === "dine_in" && (
              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-800">
                    Choose a table at {branch.name}
                  </h3>
                  <span className="text-xs text-slate-500">
                    Tables are listed by branch
                  </span>
                </div>
                <p className="mt-1 text-xs text-amber-700">
                  Live table occupancy is not tracked. Please confirm the table
                  with restaurant staff.
                </p>
                {tablesLoading ? (
                  <div className="mt-3 flex items-center gap-2 py-3 text-sm text-slate-500">
                    <LoaderCircle size={16} className="animate-spin" />
                    Loading tables…
                  </div>
                ) : tableError ? (
                  <p role="alert" className="mt-3 text-sm text-rose-700">
                    {tableError}
                  </p>
                ) : dineInTables.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {dineInTables.map((table) => (
                      <button
                        key={table.id}
                        type="button"
                        disabled={Boolean(tableSelecting)}
                        onClick={() => selectDineInTable(table.id)}
                        aria-pressed={
                          selectedDineInTable?.table?.id === table.id
                        }
                        className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-50 ${selectedDineInTable?.table?.id === table.id ? "border-orange-400 bg-orange-50 text-orange-800" : "border-slate-200 bg-white text-slate-700 hover:border-orange-300"}`}
                      >
                        {tableSelecting === table.id
                          ? "Selecting…"
                          : `Table ${table.number} · ${table.seatingCapacity} seats`}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    No active tables with online ordering set up for this
                    branch. Please ask restaurant staff.
                  </p>
                )}
                {selectedDineInTable && (
                  <div className="mt-4 flex flex-col items-center gap-4 rounded-2xl bg-[#fffaf6] p-4 sm:flex-row sm:items-center sm:p-5">
                    <img
                      src={selectedDineInTable.imageDataUrl}
                      alt={`Existing QR code for ${restaurant.name}, ${branch.name}, Table ${selectedDineInTable.table.number}`}
                      className="h-44 w-44 shrink-0 rounded-xl border border-slate-200 bg-white p-2 sm:h-48 sm:w-48"
                    />
                    <div className="w-full min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[.14em] text-orange-600">
                        Selected dine-in table
                      </p>
                      <h4 className="mt-1 text-lg font-extrabold text-slate-900">
                        Table {selectedDineInTable.table.number}
                      </h4>
                      <p className="mt-1 text-sm text-slate-500">
                        {restaurant.name} · {branch.name}
                      </p>
                      <p className="mt-2 break-all text-xs text-slate-400">
                        {selectedDineInTable.qrUrl}
                      </p>
                      {confirmedDineInTableId ===
                        selectedDineInTable.table.id ? (
                        <p
                          role="status"
                          className="mt-3 text-sm font-semibold text-emerald-700"
                        >
                          Table confirmed. Menu items will be linked to this
                          table.
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={confirmDineInTable}
                          disabled={Boolean(tableSelecting)}
                          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-500 px-5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
                        >
                          Confirm Table {selectedDineInTable.table.number}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
        <section id="restaurant-menu" className="mt-10 scroll-mt-24">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-950">Explore the menu</h2>
              <p className="mt-1 text-sm text-slate-500">
                Only active categories and available food items are shown.
              </p>
            </div>
            {branch && (
              <p className="text-xs text-slate-400">
                Showing menu for {branch.name}. Menu availability is
                restaurant-wide in this phase.
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-orange-100 bg-orange-50/70 p-4 sm:flex-row sm:items-start sm:justify-between">
            <label className="text-xs font-semibold text-slate-700">Dietary preference
              <select value={dietaryFilter} onChange={(event) => setDietaryFilter(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
                <option value="">All menu items</option><option value="vegan">Vegan</option><option value="vegetarian">Vegetarian</option><option value="gluten_free">Gluten free</option><option value="dairy_free">Dairy free</option><option value="halal">Halal</option><option value="kosher">Kosher</option>
              </select>
            </label>
            <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
              <legend className="mb-2 text-xs font-semibold text-slate-700">Hide items labeled with</legend>
              {[["peanuts", "Peanuts"], ["tree_nuts", "Tree nuts"], ["milk", "Milk"], ["eggs", "Eggs"], ["soy", "Soy"], ["wheat", "Wheat"], ["fish", "Fish"], ["shellfish", "Shellfish"], ["sesame", "Sesame"]].map(([value, label]) => <label key={value} className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={excludedAllergens.includes(value)} onChange={(event) => setExcludedAllergens((current) => event.target.checked ? [...current, value] : current.filter((entry) => entry !== value))}/>{label}</label>)}
            </fieldset>
            <p className="text-[11px] leading-4 text-amber-800 sm:max-w-48">Labels are provided by the restaurant. Missing labels do not confirm allergen safety or cross-contact conditions.</p>
          </div>
          {visibleCategories.length > 0 && (
            <nav className="sticky top-[76px] z-20 mt-5 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg shadow-slate-900/5 backdrop-blur">
              {visibleCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => {
                    setActiveCategory(category.id);
                    document
                      .getElementById(`menu-category-${category.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${activeCategory === category.id ? "bg-orange-500 text-white shadow-sm" : "text-slate-600 hover:bg-orange-50 hover:text-orange-700"}`}
                >
                  {category.name}
                </button>
              ))}
            </nav>
          )}
          {menuLoading ? (
            <div className="flex justify-center py-16">
              <LoaderCircle className="animate-spin text-orange-500" />
            </div>
          ) : visibleCategories.length ? (
            <div className="mt-5 space-y-6">
              {visibleCategories.map((category) => (
                <section
                  id={`menu-category-${category.id}`}
                  key={category.id}
                  className="scroll-mt-28 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                >
                  <h3 className="text-lg font-bold">{category.name}</h3>
                  {category.description && (
                    <p className="mt-1 text-sm text-slate-500">
                      {category.description}
                    </p>
                  )}
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {(category.items || []).map((item) => (
                      <article
                        key={item.id}
                        className="flex gap-4 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:border-orange-100 hover:shadow-md"
                      >
                        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-orange-50 sm:h-28 sm:w-28">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Utensils className="text-orange-300" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-slate-800">
                                {item.name}
                              </h4>
                              <span
                                className={`mt-1 inline-block rounded-sm border px-1 text-[9px] font-bold uppercase ${item.foodType === "veg" ? "border-emerald-500 text-emerald-600" : item.foodType === "egg" ? "border-amber-500 text-amber-600" : "border-red-500 text-red-600"}`}
                              >
                                {item.foodType.replace("_", " ")}
                              </span>
                            </div>
                            <span className="whitespace-nowrap text-sm font-extrabold text-slate-900">
                              {money(item.discountedPrice ?? item.price)}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                            {item.description || "No description provided."}
                          </p>
                          {(item.dietaryTags?.length > 0 || item.allergenTags?.length > 0) && <p className="mt-2 text-[10px] leading-4 text-slate-500">{[...(item.dietaryTags || []).map((tag) => tag.replaceAll("_", " ")), ...(item.allergenTags || []).map((tag) => `contains ${tag.replaceAll("_", " ")}`)].join(" · ")}</p>}
                          <button
                            onClick={() => setSelectedItem(item.id)}
                            disabled={
                              serviceType === "dine_in" &&
                              confirmedDineInTableId !==
                              selectedDineInTable?.table?.id
                            }
                            title={
                              serviceType === "dine_in" &&
                                confirmedDineInTableId !==
                                selectedDineInTable?.table?.id
                                ? "Select and confirm a table before adding dine-in items."
                                : undefined
                            }
                            className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-orange-50 px-3 text-xs font-bold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            View details
                            {item.options?.length
                              ? ` · ${item.options.length} options`
                              : ""}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <Utensils className="mx-auto text-slate-300" />
              <p className="mt-3 font-bold text-slate-700">{categories.length ? "No items match these filters" : "Menu coming soon"}</p>
              <p className="mt-1 text-sm text-slate-500">
                {categories.length ? "Adjust the dietary or allergen filters to see more of the menu." : "There are no active categories or available menu items for this restaurant."}
              </p>
            </div>
          )}
        </section>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </div>
      {selectedItem && (
        <FoodItemDetails
          key={selectedItem}
          itemId={selectedItem}
          branchId={selectedBranch}
          tableQrToken={
            serviceType === "dine_in" &&
              confirmedDineInTableId === selectedDineInTable?.table?.id
              ? selectedDineInTable?.tableQrToken
              : null
          }
          onClose={() => setSelectedItem(null)}
        />
      )}
      {reservationNotice && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[110] -translate-x-1/2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-xl"
        >
          {reservationNotice}
        </div>
      )}
      {reservationOpen && (
        <CustomerReservationForm
          restaurant={restaurant}
          initialBranchId={selectedBranch}
          onClose={() => {
            setReservationOpen(false);
            if (params.get("book")) {
              const next = new URLSearchParams(params);
              next.delete("book");
              setParams(next, { replace: true });
            }
          }}
          onCreated={(reservation) => {
            setReservationOpen(false);
            setReservationNotice(
              `Reservation request ${reservation.reference} sent.`,
            );
            window.setTimeout(() => setReservationNotice(""), 5000);
          }}
        />
      )}
      {qrModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setQrModal(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="branch-qr-title"
            className="max-h-[94vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/70 bg-white p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.15em] text-orange-600">
                  Digital menu QR
                </p>
                <h2
                  id="branch-qr-title"
                  className="mt-1 text-xl font-extrabold text-slate-900"
                >
                  {restaurant.name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {branch?.name}
                  {branch?.city ? ` · ${branch.city}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrModal(false)}
                aria-label="Close QR code dialog"
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={19} />
              </button>
            </div>
            <div className="mt-5 flex min-h-64 items-center justify-center rounded-2xl border border-orange-100 bg-[#fffaf6] p-4">
              {qrLoading ? (
                <div
                  className="h-56 w-56 animate-pulse rounded-2xl bg-orange-100"
                  aria-label="Loading QR code"
                />
              ) : qrError && !qrData ? (
                <div className="text-center">
                  <p role="alert" className="text-sm text-rose-700">
                    {qrError}
                  </p>
                  <button
                    type="button"
                    onClick={loadBranchQr}
                    className="mt-4 min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Try again
                  </button>
                </div>
              ) : qrData?.imageDataUrl ? (
                <img
                  src={qrData.imageDataUrl}
                  alt={`${restaurant.name}, ${qrData.branchName} digital menu QR code`}
                  className="h-auto w-full max-w-[280px] rounded-xl bg-white p-2"
                />
              ) : (
                <p className="text-center text-sm text-slate-500">
                  A QR code is not available for this branch.
                </p>
              )}
            </div>
            {qrData && !qrLoading && (
              <>
                <p className="mt-3 break-all rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-600">
                  {qrData.qrUrl}
                </p>
                {qrError && (
                  <p role="alert" className="mt-2 text-xs text-rose-700">
                    {qrError}
                  </p>
                )}
                {qrNotice && (
                  <p
                    role="status"
                    className="mt-2 text-center text-xs font-medium text-emerald-700"
                  >
                    {qrNotice}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <a
                    href={qrData.imageDataUrl}
                    download={qrData.downloadName}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 text-sm font-bold text-white transition hover:bg-orange-600"
                  >
                    <Download size={16} />
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={shareBranchQr}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Share2 size={16} />
                    Share QR
                  </button>
                  <a
                    href={qrData.qrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ExternalLink size={16} />
                    Open menu
                  </a>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

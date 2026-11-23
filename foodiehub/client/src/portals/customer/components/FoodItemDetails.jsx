import { useEffect, useState } from "react";
import { Clock3, Heart, LoaderCircle, Plus, X } from "lucide-react";
import { api } from "../../../services/api";
import { Link } from "react-router-dom";

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

export default function FoodItemDetails({ itemId, branchId, tableQrToken = null, onClose }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [variant, setVariant] = useState("");
  const [addons, setAddons] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [saved, setSaved] = useState(false);
  const [wishlistEntryId, setWishlistEntryId] = useState("");
  const [saveError, setSaveError] = useState("");
  const [cartNotice, setCartNotice] = useState("");
  const [adding, setAdding] = useState(false);
  async function toggleWishlist() {
    setSaveError("");
    try {
      if (saved && wishlistEntryId) {
        await api.delete(`/customer/wishlist/${wishlistEntryId}`);
        setSaved(false);
        setWishlistEntryId("");
      } else {
        const response = await api.post("/customer/wishlist", { type: "food", menuItemId: item.id });
        setWishlistEntryId(response.data.data.id);
        setSaved(true);
      }
    } catch (e) {
      setSaveError(
        e.response?.data?.message || "Sign in as a customer to save this item.",
      );
    }
  }
  async function addToCart() {
    setCartNotice("");
    setAdding(true);
    const payload = {
      ...(tableQrToken ? { tableQrToken } : { restaurantId: item.restaurant.id, branchId }),
      menuItemId: item.id,
      variantOptionId: variant || null,
      addonOptionIds: addons,
      quantity,
    };
    try {
      try {
        const response = await api.post("/customer/cart/items", payload);
        window.dispatchEvent(new CustomEvent("foodiehub:cart-updated", { detail: response.data.data }));
        setCartNotice(`Added to cart. ${response.data.data.itemCount} items in your cart.`);
      } catch (requestError) {
        const conflict = requestError.response?.status === 409 && /cart is already tied to another restaurant, branch, or table/i.test(requestError.response?.data?.message || "");
        if (!conflict || !window.confirm("Your cart has items for another restaurant, branch, or table. Clear those items and start a new cart here?")) throw requestError;
        await api.delete("/customer/cart");
        const response = await api.post("/customer/cart/items", payload);
        window.dispatchEvent(new CustomEvent("foodiehub:cart-updated", { detail: response.data.data }));
        setCartNotice(`Previous cart cleared after your confirmation. Item added; ${response.data.data.itemCount} items in your cart.`);
        return;
      }
    } catch (e) {
      setCartNotice(
        e.response?.data?.message ||
          "Unable to add this item. Sign in as a customer.",
      );
    } finally {
      setAdding(false);
    }
  }
  useEffect(() => {
    let active = true;
    const params = branchId ? { branchId } : {};
    api
      .get(`/public/menu-items/${itemId}`, { params })
      .then((response) => {
        if (active) setItem(response.data.data);
      })
      .catch((requestError) => {
        if (active)
          setError(
            requestError.response?.data?.message ||
              "Food details could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    api.get("/customer/wishlist").then((response) => {
      if (!active) return;
      const entry = (response.data.data || []).find((row) => row.type === "food" && row.menuItemId === itemId);
      if (entry) {
        setSaved(true);
        setWishlistEntryId(entry.id);
      }
    }).catch(() => { /* Wishlist is optional for signed-out visitors. */ });
    return () => {
      active = false;
    };
  }, [itemId, branchId]);
  const variants =
    item?.options?.filter((option) => option.type === "variant") || [];
  const extras =
    item?.options?.filter((option) => option.type === "addon") || [];
  const selectedVariant = variants.find((option) => option.id === variant);
  const selectedUnitPrice = Number(selectedVariant?.price ?? item?.discountedPrice ?? item?.price ?? 0)
    + addons.reduce((sum, id) => sum + Number(extras.find((option) => option.id === id)?.price || 0), 0);
  const selectionValid = variants.length === 0 || Boolean(selectedVariant);
  const orderContextValid = Boolean(tableQrToken || (item?.restaurant?.id && branchId));
  const canAddToCart = !adding && orderContextValid && selectionValid && quantity >= 1 && quantity <= 99;
  const displayTotal = selectedUnitPrice * quantity;
  const toggleAddon = (id) =>
    setAddons((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-500">
              Food details
            </p>
            <h2 className="mt-1 font-bold text-slate-800">
              {item?.name || "Loading item"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={19} />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-16">
            <LoaderCircle className="animate-spin text-orange-500" />
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-red-700">{error}</p>
        ) : (
          item && (
            <div className="p-5">
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="mb-4 h-56 w-full rounded-xl object-cover"
                />
              )}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {item.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.category?.name} · {item.foodType?.replace("_", " ")}
                  </p>
                </div>
                <div className="text-right font-bold text-orange-600">
                  {item.discountedPrice != null ? (
                    <>
                      <span>{money(item.discountedPrice)}</span>
                      <span className="ml-2 text-xs font-normal text-slate-400 line-through">
                        {money(item.price)}
                      </span>
                    </>
                  ) : (
                    money(item.price)
                  )}
                </div>
              </div>
              {item.description && (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {item.description}
                </p>
              )}
              {item.preparationTime != null && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock3 size={14} />
                  {item.preparationTime} minutes preparation
                </p>
              )}
              {variants.length > 0 && (
                <fieldset className="mt-5">
                  <legend className="mb-2 text-sm font-bold text-slate-800">
                    Variants
                  </legend>
                  <div className="space-y-2">
                    {variants.map((option) => (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm transition ${variant === option.id ? "border-orange-400 bg-orange-50 ring-1 ring-orange-200" : "border-slate-200 hover:border-orange-300"}`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="food-variant"
                            checked={variant === option.id}
                            onChange={() => setVariant(option.id)}
                          />
                          {option.name}
                        </span>
                        <span className="font-semibold text-slate-700">
                          {money(option.price)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {extras.length > 0 && (
                <fieldset className="mt-5">
                  <legend className="mb-2 text-sm font-bold text-slate-800">
                    Add-ons
                  </legend>
                  <div className="space-y-2">
                    {extras.map((option) => (
                      <label
                        key={option.id}
                        className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 p-3 text-sm hover:border-orange-300"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={addons.includes(option.id)}
                            onChange={() => toggleAddon(option.id)}
                          />
                          {option.name}
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <Plus size={13} />
                          {money(option.price)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">{selectedVariant ? `${selectedVariant.name} price` : "Unit price"}</p>
                  <p className="text-lg font-extrabold text-slate-900">{money(selectedUnitPrice)}</p>
                </div>
                <div className="flex items-center gap-2" aria-label="Quantity selector">
                  <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="h-10 w-10 rounded-lg border border-slate-200 bg-white text-lg font-bold disabled:opacity-40">−</button>
                  <span className="min-w-8 text-center font-bold" aria-live="polite">{quantity}</span>
                  <button type="button" aria-label="Increase quantity" disabled={quantity >= 99} onClick={() => setQuantity((value) => Math.min(99, value + 1))} className="h-10 w-10 rounded-lg border border-slate-200 bg-white text-lg font-bold disabled:opacity-40">+</button>
                </div>
                <p className="w-full text-right text-sm font-bold text-slate-700">Line total: {money(displayTotal)}</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={addToCart}
                  disabled={!canAddToCart}
                  className="min-h-11 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {adding ? "Adding…" : `Add to cart · ${money(displayTotal)}`}
                </button>
                <button
                  onClick={toggleWishlist}
                  className="inline-flex items-center gap-2 rounded-xl border border-pink-200 px-4 py-2.5 text-sm font-semibold text-pink-700 disabled:opacity-60"
                >
                  <Heart size={16} />
                  {saved ? "Remove from wishlist" : "Save to wishlist"}
                </button>
                <Link
                  to="/customer/cart"
                  onClick={onClose}
                  className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-slate-600"
                >
                  View cart
                </Link>
              </div>
              {cartNotice && (
                <p role="status" className="mt-2 text-sm text-orange-700">
                  {cartNotice}
                  {cartNotice.includes("Sign in") && (
                    <>
                      {" "}
                      <Link
                        to="/customer/login"
                        className="font-bold underline"
                      >
                        Sign in
                      </Link>
                    </>
                  )}
                </p>
              )}
              {saveError && (
                <p className="mt-2 text-xs text-red-600">
                  {saveError}{" "}
                  <Link to="/customer/login" className="font-bold underline">
                    Sign in
                  </Link>
                </p>
              )}
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                Prices are recalculated by FoodieHub when items are added to
                your cart. Delivery coverage and additional tax or fee rules are
                not configured.
              </p>
            </div>
          )
        )}
      </section>
    </div>
  );
}

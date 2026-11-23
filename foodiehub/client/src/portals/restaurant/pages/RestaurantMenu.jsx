



import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChefHat,
  Clock3,
  Edit3,
  ImagePlus,
  LoaderCircle,
  Plus,
  Search,
  Star,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { api } from "../../../services/api";

const emptyItem = {
  name: "",
  description: "",
  categoryId: "",
  price: "",
  discountedPrice: "",
  imageUrl: "",
  foodType: "veg",
  dietaryTags: [],
  allergenTags: [],
  preparationTime: "",
  isAvailable: true,
  isFeatured: false,
  displayOrder: 0,
  options: [],
};

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

const errorText = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Something went wrong.";

function Field({ label, children }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      {children}
    </label>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6 ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={19} />
          </button>
        </div>

        {children}
      </section>
    </div>
  );
}

function ItemForm({ initial, categories, onCancel, onSave, busy }) {
  const [form, setForm] = useState(() => ({
    ...emptyItem,
    categoryId: categories[0]?.id || "",
    ...(initial || {}),
    dietaryTags: initial?.dietaryTags || [],
    allergenTags: initial?.allergenTags || [],
    options: initial?.options || [],
  }));

  const [error, setError] = useState("");

  function change(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addOption(type) {
    change("options", [
      ...form.options,
      { type, name: "", price: "" },
    ]);
  }

  function updateOption(index, key, value) {
    change(
      "options",
      form.options.map((option, i) =>
        i === index ? { ...option, [key]: value } : option,
      ),
    );
  }

  function removeOption(index) {
    change(
      "options",
      form.options.filter((_, i) => i !== index),
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (
      !form.name.trim() ||
      !form.categoryId ||
      form.price === "" ||
      !Number.isFinite(Number(form.price)) ||
      Number(form.price) < 0
    ) {
      return setError(
        "Enter a name, category, and valid non-negative price.",
      );
    }

    if (
      form.discountedPrice !== "" &&
      (!Number.isFinite(Number(form.discountedPrice)) ||
        Number(form.discountedPrice) < 0 ||
        Number(form.discountedPrice) > Number(form.price))
    ) {
      return setError(
        "Discounted price must not exceed the regular price.",
      );
    }

    if (
      form.options.some(
        (option) =>
          !option.name.trim() ||
          option.price === "" ||
          !Number.isFinite(Number(option.price)) ||
          Number(option.price) < 0,
      )
    ) {
      return setError(
        "Complete each variant and add-on with a valid price.",
      );
    }

    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        price: Number(form.price),
        discountedPrice:
          form.discountedPrice === ""
            ? null
            : Number(form.discountedPrice),
        preparationTime:
          form.preparationTime === ""
            ? null
            : Number(form.preparationTime),
        displayOrder: Number(form.displayOrder || 0),
        options: form.options.map((option) => ({
          ...option,
          price: Number(option.price),
        })),
      });
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Food name">
          <input
            className={inputClass}
            maxLength={150}
            required
            value={form.name}
            onChange={(e) => change("name", e.target.value)}
          />
        </Field>

        <Field label="Category">
          <select
            className={inputClass}
            required
            value={form.categoryId}
            onChange={(e) => change("categoryId", e.target.value)}
          >
            <option value="">Select a category</option>

            {categories
              .filter(
                (category) =>
                  category.isActive ||
                  String(category.id) === String(form.categoryId),
              )
              .map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                  disabled={!category.isActive}
                >
                  {category.name}
                  {!category.isActive
                    ? " (inactive · existing assignment)"
                    : ` · ${
                        category.scope === "global"
                          ? "Global"
                          : "Restaurant"
                      }`}
                </option>
              ))}
          </select>
        </Field>
      </div>

      <Field label="Description">
        <textarea
          className={inputClass}
          rows="2"
          value={form.description || ""}
          onChange={(e) => change("description", e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Price (₹)">
          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.01"
            required
            value={form.price}
            onChange={(e) => change("price", e.target.value)}
          />
        </Field>

        <Field label="Discounted price (₹)">
          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.01"
            value={form.discountedPrice ?? ""}
            onChange={(e) =>
              change("discountedPrice", e.target.value)
            }
          />
        </Field>

        <Field label="Food type">
          <select
            className={inputClass}
            value={form.foodType}
            onChange={(e) => change("foodType", e.target.value)}
          >
            <option value="veg">Veg</option>
            <option value="non_veg">Non-Veg</option>
            <option value="egg">Egg</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preparation time (minutes)">
          <input
            className={inputClass}
            type="number"
            min="0"
            step="1"
            value={form.preparationTime ?? ""}
            onChange={(e) =>
              change("preparationTime", e.target.value)
            }
          />
        </Field>

        <Field label="Display order">
          <input
            className={inputClass}
            type="number"
            min="0"
            step="1"
            value={form.displayOrder ?? 0}
            onChange={(e) =>
              change("displayOrder", e.target.value)
            }
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[['dietaryTags', 'Dietary labels', [['vegan', 'Vegan'], ['vegetarian', 'Vegetarian'], ['gluten_free', 'Gluten free'], ['dairy_free', 'Dairy free'], ['halal', 'Halal'], ['kosher', 'Kosher']]], ['allergenTags', 'Contains these allergens', [['peanuts', 'Peanuts'], ['tree_nuts', 'Tree nuts'], ['milk', 'Milk'], ['eggs', 'Eggs'], ['soy', 'Soy'], ['wheat', 'Wheat'], ['fish', 'Fish'], ['shellfish', 'Shellfish'], ['sesame', 'Sesame']]]].map(([key, label, options]) => (
          <fieldset key={key} className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-xs font-bold text-slate-700">{label}</legend>
            <div className="grid grid-cols-2 gap-2">
              {options.map(([value, text]) => <label key={value} className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={(form[key] || []).includes(value)} onChange={(event) => change(key, event.target.checked ? [...(form[key] || []), value] : (form[key] || []).filter((tag) => tag !== value))} />{text}</label>)}
            </div>
          </fieldset>
        ))}
      </div>
      <p className="text-xs leading-5 text-amber-800">Keep these labels accurate and current. Allergen labels are restaurant-provided and do not describe cross-contact risk.</p>

      <Field label="Image URL (optional)">
        <input
          className={inputClass}
          type="url"
          placeholder="https://example.com/food.jpg"
          value={form.imageUrl || ""}
          onChange={(e) => change("imageUrl", e.target.value)}
        />
      </Field>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(form.isAvailable)}
            onChange={(e) =>
              change("isAvailable", e.target.checked)
            }
          />
          Available
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(form.isFeatured)}
            onChange={(e) =>
              change("isFeatured", e.target.checked)
            }
          />
          Featured item
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-700">
              Variants & add-ons
            </p>
            <p className="text-xs text-slate-400">
              Optional choices customers can select later.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addOption("variant")}
              className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50"
            >
              Add variant
            </button>

            <button
              type="button"
              onClick={() => addOption("addon")}
              className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-slate-50"
            >
              Add add-on
            </button>
          </div>
        </div>

        {form.options.map((option, index) => (
          <div
            key={index}
            className="mb-2 grid grid-cols-[1fr_100px_100px_32px] gap-2"
          >
            <input
              aria-label="Option name"
              className="min-w-0 rounded-lg border px-2 py-2 text-sm"
              placeholder="e.g. Large"
              value={option.name}
              onChange={(e) =>
                updateOption(index, "name", e.target.value)
              }
            />

            <select
              aria-label="Option type"
              className="min-w-0 rounded-lg border px-2 py-2 text-xs"
              value={option.type}
              onChange={(e) =>
                updateOption(index, "type", e.target.value)
              }
            >
              <option value="variant">Variant</option>
              <option value="addon">Add-on</option>
            </select>

            <input
              aria-label="Option price"
              className="min-w-0 rounded-lg border px-2 py-2 text-sm"
              type="number"
              min="0"
              step="0.01"
              placeholder="₹ price"
              value={option.price}
              onChange={(e) =>
                updateOption(index, "price", e.target.value)
              }
            />

            <button
              type="button"
              aria-label="Remove option"
              onClick={() => removeOption(index)}
              className="text-slate-400 hover:text-red-600"
            >
              <X size={17} />
            </button>
          </div>
        ))}

        {!form.options.length && (
          <p className="text-xs text-slate-400">
            No options added.
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-slate-600"
        >
          Cancel
        </button>

        <button
          disabled={busy}
          className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save food item"}
        </button>
      </div>
    </form>
  );
}

function Stat({ title, value, caption, icon: Icon, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {title}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-800">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-400">{caption}</p>
        </div>

        <span className={`rounded-xl p-3 ${tone}`}>
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

export default function RestaurantMenu() {
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [availability, setAvailability] = useState("all");

  const [itemModal, setItemModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = {};

      if (search) params.search = search;
      if (categoryFilter) params.categoryId = categoryFilter;

      if (availability !== "all") {
        params.availability = availability;
      }

      const [summaryResponse, categoriesResponse, itemsResponse] =
        await Promise.all([
          api.get("/restaurant/menu/summary"),
          api.get("/restaurant/menu/categories"),
          api.get("/restaurant/menu/items", { params }),
        ]);

      setSummary(summaryResponse.data.data);
      setCategories(categoriesResponse.data.data || []);
      setItems(itemsResponse.data.data || []);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, availability]);

  useEffect(() => {
    load();
  }, [load]);

  const totalCount = summary?.totalItems ?? 0;

  const availableCategories = useMemo(
    () => categories.filter((category) => category.isActive),
    [categories],
  );

  async function saveItem(data) {
    setBusy(true);

    try {
      if (itemModal?.id) {
        await api.put(
          `/restaurant/menu/items/${itemModal.id}`,
          data,
        );
      } else {
        await api.post("/restaurant/menu/items", data);
      }

      setItemModal(null);
      setNotice("Food item saved successfully.");

      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleItem(item, key) {
    try {
      await api.patch(
        `/restaurant/menu/items/${item.id}/${
          key === "isAvailable" ? "availability" : "featured"
        }`,
        { [key]: !item[key] },
      );

      setNotice("Food item updated successfully.");
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function deleteItem(item) {
    if (
      !window.confirm(
        `Delete "${item.name}" and its variants/add-ons?`,
      )
    ) {
      return;
    }

    try {
      await api.delete(`/restaurant/menu/items/${item.id}`);

      setNotice("Food item deleted successfully.");
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Page heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-400">
            Workspace / Restaurant Management
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            Food Menu
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Manage your dishes, prices, availability, and menu options.
          </p>
        </div>

        <button
          type="button"
          disabled={!availableCategories.length}
          onClick={() => setItemModal({})}
          className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={17} />
          Add Food Item
        </button>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="flex items-center gap-2">
            <Check size={17} />
            {notice}
          </span>

          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Statistics */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          title="Total Categories"
          value={summary?.totalCategories ?? categories.length}
          caption="Approved menu sections"
          icon={Utensils}
          tone="bg-orange-50 text-orange-600"
        />

        <Stat
          title="Total Menu Items"
          value={summary?.totalItems ?? "—"}
          caption="Across all categories"
          icon={ChefHat}
          tone="bg-violet-50 text-violet-600"
        />

        <Stat
          title="Available Items"
          value={summary?.availableItems ?? "—"}
          caption="Ready for ordering"
          icon={Check}
          tone="bg-emerald-50 text-emerald-600"
        />

        <Stat
          title="Unavailable Items"
          value={summary?.unavailableItems ?? "—"}
          caption="Currently hidden"
          icon={Clock3}
          tone="bg-amber-50 text-amber-600"
        />
      </section>

      {/* Menu filters */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              placeholder="Search food items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <select
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 outline-none focus:border-orange-400"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>

            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 outline-none focus:border-orange-400"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          >
            <option value="all">All availability</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </div>
      </section>

      {/* Food items */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              Food Items
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              Showing {items.length} of {totalCount} items
            </p>
          </div>
        </div>

        {loading && !items.length ? (
          <div className="flex justify-center py-10">
            <LoaderCircle className="animate-spin text-orange-500" />
          </div>
        ) : items.length ? (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-4 px-5 py-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-300">
                      <ImagePlus size={22} />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-800">
                      {item.name}
                    </h3>

                    <span
                      className={`rounded-sm border px-1 text-[9px] font-bold uppercase ${
                        item.foodType === "veg"
                          ? "border-emerald-500 text-emerald-600"
                          : item.foodType === "egg"
                            ? "border-amber-500 text-amber-600"
                            : "border-red-500 text-red-600"
                      }`}
                    >
                      {item.foodType?.replace("_", " ")}
                    </span>

                    {item.isFeatured && (
                      <Star
                        size={14}
                        className="fill-amber-400 text-amber-400"
                      />
                    )}
                  </div>

                  <p className="mt-1 truncate text-xs text-slate-400">
                    {item.category?.name || "Category"}
                    {item.description ? ` · ${item.description}` : ""}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-bold text-slate-800">
                      {money(item.discountedPrice ?? item.price)}
                    </span>

                    {item.discountedPrice != null && (
                      <span className="text-slate-400 line-through">
                        {money(item.price)}
                      </span>
                    )}

                    {item.preparationTime != null && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock3 size={12} />
                        {item.preparationTime} min
                      </span>
                    )}

                    {item.options?.length > 0 && (
                      <span className="text-slate-400">
                        {item.options.length} options
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleItem(item, "isAvailable")}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                      item.isAvailable
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {item.isAvailable ? "Available" : "Unavailable"}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleItem(item, "isFeatured")}
                    title="Toggle featured"
                    className={`rounded-lg p-2 ${
                      item.isFeatured
                        ? "text-amber-500"
                        : "text-slate-400 hover:bg-slate-100"
                    }`}
                  >
                    <Star
                      size={17}
                      className={
                        item.isFeatured ? "fill-amber-400" : ""
                      }
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setItemModal({
                        ...item,
                        options: item.options || [],
                      })
                    }
                    aria-label="Edit food item"
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                  >
                    <Edit3 size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteItem(item)}
                    aria-label="Delete food item"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-300">
              <ChefHat size={28} />
            </div>

            <p className="mt-4 font-semibold text-slate-700">
              {categories.length
                ? "No food items found"
                : "No approved categories yet"}
            </p>

            <p className="mt-1 text-sm text-slate-400">
              {categories.length
                ? "Try another search or add your first menu item."
                : "Once a category is approved, you can add food items from the Category page."}
            </p>

            {availableCategories.length > 0 && (
              <button
                type="button"
                onClick={() => setItemModal({})}
                className="mt-4 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                <Plus size={15} className="mr-1 inline" />
                Add Food Item
              </button>
            )}
          </div>
        )}
      </section>

      {/* Food item modal */}
      {itemModal && (
        <Modal
          title={itemModal.id ? "Edit food item" : "Add food item"}
          wide
          onClose={() => setItemModal(null)}
        >
          <ItemForm
            initial={itemModal.id ? itemModal : null}
            categories={categories}
            busy={busy}
            onCancel={() => setItemModal(null)}
            onSave={saveItem}
          />
        </Modal>
      )}
    </div>
  );
}

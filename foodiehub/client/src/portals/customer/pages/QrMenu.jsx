import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Armchair, ChefHat, CircleAlert, MapPin, RefreshCw, ShoppingCart, Utensils } from 'lucide-react';
import { api } from '../../../services/api';
import FoodItemDetails from '../components/FoodItemDetails';

const money = (value) => `₹${Number(value || 0).toFixed(2)}`;

export default function QrMenu() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [dietaryFilter, setDietaryFilter] = useState('');
  const [excludedAllergens, setExcludedAllergens] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/public/qr/${encodeURIComponent(token)}`);
      setData(response.data.data);
      setActiveCategory(response.data.data.categories?.[0]?.name || '');
    } catch (requestError) {
      setData(null);
      setError(requestError.response?.data?.message || 'This table QR code is invalid or unavailable.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const categories = data?.categories || [];
  const visibleCategories = useMemo(() => categories.map((category) => ({
    ...category,
    items: (category.items || []).filter((item) => (!dietaryFilter || (item.dietaryTags || []).includes(dietaryFilter)) && excludedAllergens.every((allergen) => !(item.allergenTags || []).includes(allergen))),
  })).filter((category) => category.items.length), [categories, dietaryFilter, excludedAllergens]);
  const itemCount = useMemo(() => visibleCategories.reduce((count, category) => count + category.items.length, 0), [visibleCategories]);

  if (loading) return (
    <main className="min-h-screen bg-[#fffaf6]" aria-label="Loading digital menu">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-8 sm:py-10">
        <div className="h-48 animate-pulse rounded-3xl bg-orange-100" />
        <div className="h-12 animate-pulse rounded-2xl bg-white" />
        <div className="grid gap-4 sm:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-white" />)}</div>
      </div>
    </main>
  );

  if (!data) return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf6] px-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <CircleAlert size={36} className="mx-auto text-rose-500" />
        <h1 className="mt-4 text-xl font-bold text-slate-900">Menu unavailable</h1>
        <p role="alert" className="mt-2 text-sm text-slate-600">{error}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700"><RefreshCw size={15} />Try again</button><Link to="/restaurants" className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Browse restaurants</Link></div>
      </section>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#fffaf6] pb-12">
      <header className="relative overflow-hidden bg-[#171b2d] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.3),_transparent_52%)]" />
        <div className="relative mx-auto max-w-5xl px-4 pb-7 pt-5 sm:px-8 sm:pb-10 sm:pt-7">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-orange-300"><Utensils size={15} />FoodieHub menu</div>
          <div className="mt-6 flex items-start gap-4">
            {data.restaurant.logo && <img src={data.restaurant.logo} alt="" className="h-16 w-16 shrink-0 rounded-2xl bg-white/10 object-cover sm:h-20 sm:w-20" />}
            <div className="min-w-0"><h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{data.restaurant.name}</h1>{data.restaurant.description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{data.restaurant.description}</p>}</div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-sm text-slate-100"><MapPin size={15} className="text-orange-300" />{data.branch.name}</span>
            <span className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white"><Armchair size={15} className="text-orange-300" />Table {data.table.number}</span>
          </div>
          {data.branch.address && <p className="mt-3 max-w-2xl text-xs text-slate-400">{data.branch.address}</p>}
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 sm:px-8">
        <div className="sticky top-0 z-20 -mx-4 border-b border-orange-100 bg-[#fffaf6]/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-900">Dine-in menu · Table {data.table.number} <span className="ml-1 font-normal text-slate-500">· {itemCount} items</span></p><span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:inline-flex"><ChefHat size={14} />Add items to your table order</span></div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold text-slate-700">Dietary preference <select value={dietaryFilter} onChange={(event) => setDietaryFilter(event.target.value)} className="ml-2 min-h-9 rounded-lg border border-slate-200 bg-white px-2"><option value="">All items</option><option value="vegan">Vegan</option><option value="vegetarian">Vegetarian</option><option value="gluten_free">Gluten free</option><option value="dairy_free">Dairy free</option><option value="halal">Halal</option><option value="kosher">Kosher</option></select></label>
            <details className="text-xs"><summary className="cursor-pointer font-semibold text-slate-700">Hide labeled allergens</summary><div className="mt-2 flex max-w-2xl flex-wrap gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-3">{[['peanuts','Peanuts'],['tree_nuts','Tree nuts'],['milk','Milk'],['eggs','Eggs'],['soy','Soy'],['wheat','Wheat'],['fish','Fish'],['shellfish','Shellfish'],['sesame','Sesame']].map(([value,label]) => <label key={value} className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={excludedAllergens.includes(value)} onChange={(event) => setExcludedAllergens((current) => event.target.checked ? [...current,value] : current.filter((entry) => entry !== value))}/>{label}</label>)}</div></details>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-amber-800">Dietary and allergen labels are restaurant-provided. Missing labels do not confirm allergen safety or cross-contact conditions.</p>
          {visibleCategories.length > 0 && <nav aria-label="Menu categories" className="mt-3 flex gap-2 overflow-x-auto pb-0.5">{visibleCategories.map((category) => <button type="button" key={category.name} onClick={() => { setActiveCategory(category.name); document.getElementById(`qr-category-${encodeURIComponent(category.name)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${activeCategory === category.name ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-orange-50'}`}>{category.name}</button>)}</nav>}
        </div>
        <section className="py-6 sm:py-8">
          <div className="mb-5 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-orange-600">Made for your table</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Explore the menu</h2></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">{itemCount} available</span></div>
          {categories.length === 0 || itemCount === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center"><Utensils className="mx-auto text-slate-300" /><h3 className="mt-3 font-bold text-slate-800">{categories.length ? 'No items match these filters' : 'The menu is being prepared'}</h3><p className="mt-1 text-sm text-slate-500">{categories.length ? 'Adjust the dietary or allergen filters to see more menu items.' : 'There are no available menu items at this table right now. Please ask restaurant staff for help.'}</p></div>
          ) : (
            <div className="space-y-8">{visibleCategories.map((category) => (
              <section key={category.name} id={`qr-category-${encodeURIComponent(category.name)}`} className="scroll-mt-36">
                <div className="mb-3 border-b border-orange-100 pb-3"><h3 className="text-xl font-bold text-slate-900">{category.name}</h3>{category.description && <p className="mt-1 text-sm text-slate-500">{category.description}</p>}</div>
                <div className="grid gap-3 sm:grid-cols-2">{category.items.map((item) => (
                  <article key={`${category.name}-${item.name}`} className="flex min-w-0 gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" className="h-24 w-24 shrink-0 rounded-xl bg-slate-100 object-cover sm:h-28 sm:w-28" /> : <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-300 sm:h-28 sm:w-28"><Utensils size={24} /></div>}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-1.5"><span aria-label={item.foodType === 'non_veg' ? 'Non-vegetarian' : item.foodType === 'egg' ? 'Contains egg' : 'Vegetarian'} className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border ${item.foodType === 'non_veg' ? 'border-rose-600' : item.foodType === 'egg' ? 'border-amber-600' : 'border-emerald-600'}`}><span className={`h-1.5 w-1.5 rounded-full ${item.foodType === 'non_veg' ? 'bg-rose-600' : item.foodType === 'egg' ? 'bg-amber-600' : 'bg-emerald-600'}`} /></span><h4 className="line-clamp-2 font-bold leading-snug text-slate-900">{item.name}</h4></div>
                      {item.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.description}</p>}
                      {(item.dietaryTags?.length > 0 || item.allergenTags?.length > 0) && <p className="mt-1 text-[10px] leading-4 text-slate-500">{[...(item.dietaryTags || []).map((tag) => tag.replaceAll('_', ' ')), ...(item.allergenTags || []).map((tag) => `contains ${tag.replaceAll('_', ' ')}`)].join(' · ')}</p>}
                      {item.options?.length > 0 && <details className="mt-2 text-xs text-slate-500"><summary className="w-fit cursor-pointer font-semibold text-orange-700">Variants &amp; add-ons ({item.options.length})</summary><ul className="mt-1 space-y-1">{item.options.map((option) => <li key={`${option.type}-${option.name}`} className="flex justify-between gap-3"><span>{option.name} <span className="text-slate-400">({option.type === 'variant' ? 'variant' : 'add-on'})</span></span><span className="shrink-0 font-medium text-slate-700">{money(option.price)}</span></li>)}</ul></details>}
                      <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">{item.discountedPrice != null && Number(item.discountedPrice) < Number(item.price) ? <><span className="font-bold text-slate-900">{money(item.discountedPrice)}</span><span className="text-xs text-slate-400 line-through">{money(item.price)}</span></> : <span className="font-bold text-slate-900">{money(item.price)}</span>}</div>
                      <button type="button" onClick={() => setSelectedItem(item.id)} className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 text-xs font-bold text-white transition hover:bg-orange-600"><ShoppingCart size={14} />Customize &amp; add</button>
                    </div>
                  </article>
                ))}</div>
              </section>
            ))}</div>
          )}
        </section>
        <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-center text-sm text-orange-900"><p className="font-semibold">Order for Table {data.table.number}</p><p className="mt-1 text-xs text-orange-800">Your selections will stay linked to this table at checkout.</p><Link to="/customer/cart" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700"><ShoppingCart size={15} />View cart</Link></div>
        <footer className="pt-6 text-center text-xs text-slate-400">Powered by FoodieHub</footer>
      </div>
      {selectedItem && <FoodItemDetails key={selectedItem} itemId={selectedItem} tableQrToken={token} onClose={() => setSelectedItem(null)} />}
    </main>
  );
}

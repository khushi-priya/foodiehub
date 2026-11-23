import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, LoaderCircle, Plus, Search, Store, X } from 'lucide-react';
import { api } from '../../../services/api';

const blank = { name: '', description: '', imageUrl: '', displayOrder: 0 };
const messageOf = (error) => error.response?.data?.message || 'Unable to load food categories.';

export default function FoodCategories() {
  const [data, setData] = useState({ items: [], page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await api.get('/admin/food-categories', { params: { search: search || undefined, active: active === 'all' ? undefined : active, page, pageSize: 20 } });
      setData(response.data.data);
    } catch (error) { setError(messageOf(error)); } finally { setLoading(false); }
  }, [search, active, page]);
  useEffect(() => { load(); }, [load]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (form.id) await api.put(`/admin/food-categories/${form.id}`, form);
      else await api.post('/admin/food-categories', form);
      setForm(null); setNotice('Global food category saved and available to restaurants.'); await load();
    } catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  async function toggle(category) {
    setBusy(true); setError('');
    try { await api.patch(`/admin/food-categories/${category.id}/status`, { isActive: !category.isActive }); setNotice(`Category ${category.isActive ? 'deactivated' : 'activated'}.`); await load(); }
    catch (error) { setError(messageOf(error)); } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">Platform management</p><h1 className="mt-2 text-3xl font-extrabold text-slate-900">Food Categories</h1><p className="mt-2 text-sm text-slate-500">Manage the approved global category library used by restaurant menus.</p></div><button type="button" onClick={() => setForm({ ...blank })} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600"><Plus size={17}/>Create category</button></header>
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}{error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_200px]"><label className="relative"><span className="sr-only">Search categories</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search category names" className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm"/></label><select value={active} onChange={(event) => { setPage(1); setActive(event.target.value); }} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="all">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-800">Global category library</h2><p className="mt-1 text-xs text-slate-500">{data.total} categories</p></div>{loading ? <div className="flex justify-center p-12"><LoaderCircle className="animate-spin text-orange-500"/></div> : data.items.length ? <div className="divide-y divide-slate-100">{data.items.map((category) => <article key={category.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-orange-50 text-orange-500">{category.imageUrl ? <img src={category.imageUrl} alt="" className="h-full w-full object-cover"/> : <ImagePlus size={20}/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{category.name}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${category.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{category.isActive ? 'ACTIVE' : 'INACTIVE'}</span></div><p className="mt-1 text-sm text-slate-500">{category.description || 'No description'}</p><p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500"><Store size={13}/>{category.restaurantCount} restaurants use this category</p>{category.restaurants?.length > 0 && <p className="mt-1 text-xs text-slate-400">{category.restaurants.map((restaurant) => restaurant.name).join(', ')}</p>}</div><div className="flex gap-2"><button type="button" onClick={() => setForm({ name: category.name, description: category.description || '', imageUrl: category.imageUrl || '', displayOrder: category.displayOrder, id: category.id })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Edit</button><button type="button" disabled={busy} onClick={() => toggle(category)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">{category.isActive ? 'Deactivate' : 'Activate'}</button></div></article>)}</div> : <div className="p-12 text-center text-sm text-slate-500">No global categories match these filters.</div>}</section>
    <footer className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500"><span>Page {page} of {Math.max(data.totalPages, 1)}</span><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button disabled={page >= data.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></footer>
    {form && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setForm(null); }}><form onSubmit={save} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{form.id ? 'Edit food category' : 'Create global category'}</h2><button type="button" onClick={() => setForm(null)} aria-label="Close"><X size={18}/></button></div><label className="block text-xs font-semibold">Category name<input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm"/></label><label className="block text-xs font-semibold">Description<textarea maxLength={500} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 w-full rounded-xl border p-3 text-sm"/></label><label className="block text-xs font-semibold">Image URL (optional)<input type="url" maxLength={1000} value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm"/></label>{error && <p className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setForm(null)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save category'}</button></div></form></div>}
  </div>;
}

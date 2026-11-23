import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, ImagePlus, LoaderCircle, Search, X } from 'lucide-react';
import { api } from '../../../services/api';

const filters = ['all', 'pending', 'approved', 'rejected'];
const msg = (error) => error.response?.data?.message || 'Unable to complete category request action.';

export default function FoodCategoryRequests() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, totalPages: 1 });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [requests, library] = await Promise.all([
        api.get('/admin/food-category-requests', { params: { status: status === 'all' ? undefined : status, search: search || undefined, page, pageSize: 20 } }),
        api.get('/admin/food-categories', { params: { active: 'true', pageSize: 50 } }),
      ]);
      setData(requests.data.data); setCategories(library.data.data.items);
    } catch (error) { setError(msg(error)); } finally { setLoading(false); }
  }, [status, search, page]);
  useEffect(() => { load(); }, [load]);
  async function details(request) {
    setError('');
    try { const response = await api.get(`/admin/food-category-requests/${request.id}`); setSelected(response.data.data); }
    catch (error) { setError(msg(error)); }
  }
  async function review(request, type, categoryId) {
    setBusyId(request.id); setError('');
    try {
      await api.post(`/admin/food-category-requests/${request.id}/approve-${type}`, categoryId ? { categoryId } : {});
      setNotice(`Request approved as ${type === 'global' ? 'a global' : 'a restaurant-only'} category.`); setSelected(null); await load();
    } catch (error) { setError(msg(error)); } finally { setBusyId(''); }
  }
  async function reject(event) {
    event.preventDefault(); if (!rejecting) return;
    setBusyId(rejecting.id); setError('');
    try { await api.post(`/admin/food-category-requests/${rejecting.id}/reject`, { reason }); setNotice('Request rejected and feedback saved.'); setRejecting(null); setReason(''); await load(); }
    catch (error) { setError(msg(error)); } finally { setBusyId(''); }
  }
  return <div className="space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">Platform management</p><h1 className="mt-2 text-3xl font-extrabold text-slate-900">Category Requests</h1><p className="mt-2 text-sm text-slate-500">Review restaurant suggestions and approve them globally or for the requesting restaurant.</p></header>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}{notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto]"><label className="relative"><span className="sr-only">Search category requests</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search category or restaurant" className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm"/></label><div className="flex flex-wrap gap-2">{filters.map((filter) => <button key={filter} type="button" onClick={() => { setPage(1); setStatus(filter); }} className={`rounded-xl px-3 py-2 text-xs font-bold capitalize ${status === filter ? 'bg-orange-500 text-white' : 'border border-slate-200 text-slate-600'}`}>{filter === 'all' ? 'All Requests' : filter}</button>)}</div></section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-800">{data.total} requests</h2></div>{loading ? <div className="flex justify-center p-12"><LoaderCircle className="animate-spin text-orange-500"/></div> : data.items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Category</th><th className="px-4 py-3">Restaurant / requested by</th><th className="px-4 py-3">Request date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{data.items.map((request) => { const matching = categories.find((category) => category.name.normalize('NFKC').trim().toLowerCase() === request.name.normalize('NFKC').trim().toLowerCase()); return <tr key={request.id}><td className="px-4 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-orange-50 text-orange-500">{request.imageUrl ? <img src={request.imageUrl} alt="" className="h-full w-full object-cover"/> : <ImagePlus size={17}/>}</span><span><strong className="block">{request.name}</strong><span className="text-xs text-slate-500">{request.description || 'No description'}</span></span></div></td><td className="px-4 py-4"><strong>{request.restaurant?.name}</strong><span className="block text-xs text-slate-500">{request.requester?.firstName} {request.requester?.lastName}</span></td><td className="px-4 py-4 text-xs text-slate-600">{new Date(request.createdAt).toLocaleDateString()}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${request.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : request.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{request.status}</span></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => details(request)} title="View details" className="rounded-lg border p-2 text-slate-600"><Eye size={15}/></button>{request.status === 'pending' && <><button type="button" disabled={busyId === request.id} onClick={() => review(request, 'global')} className="rounded-lg bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-white disabled:opacity-50"><Check size={13} className="mr-1 inline"/>Global</button>{matching && <button type="button" disabled={busyId === request.id} onClick={() => review(request, 'global', matching.id)} className="rounded-lg border border-blue-200 px-2.5 py-2 text-[10px] font-bold text-blue-700 disabled:opacity-50">Map {matching.name}</button>}<button type="button" disabled={busyId === request.id} onClick={() => review(request, 'restaurant')} className="rounded-lg border border-emerald-200 px-2.5 py-2 text-[10px] font-bold text-emerald-700 disabled:opacity-50">Restaurant only</button><button type="button" disabled={busyId === request.id} onClick={() => { setRejecting(request); setReason(''); }} className="rounded-lg border border-rose-200 px-2.5 py-2 text-[10px] font-bold text-rose-700 disabled:opacity-50">Reject</button></>}</div></td></tr>; })}</tbody></table></div> : <div className="p-12 text-center text-sm text-slate-500">No category requests match these filters.</div>}</section>
    <footer className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500"><span>Page {page} of {Math.max(data.totalPages, 1)}</span><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><button disabled={page >= data.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></footer>
    {selected && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><h2 className="text-lg font-bold">Category request details</h2><button type="button" onClick={() => setSelected(null)} aria-label="Close"><X size={18}/></button></div><h3 className="text-xl font-bold">{selected.name}</h3><p className="text-sm text-slate-600">{selected.description || 'No description provided.'}</p><p className="text-sm"><strong>Restaurant:</strong> {selected.restaurant?.name}</p><p className="text-sm"><strong>Requested by:</strong> {selected.requester?.firstName} {selected.requester?.lastName} ({selected.requester?.email})</p><p className="text-sm"><strong>Submitted:</strong> {new Date(selected.createdAt).toLocaleString()}</p>{selected.rejectionReason && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><strong>Rejection reason:</strong> {selected.rejectionReason}</p>}<div><h4 className="font-bold">Review history</h4>{(selected.history || []).map((entry) => <p key={entry.id} className="mt-2 border-l-2 border-orange-300 pl-3 text-xs text-slate-600">{entry.action.replaceAll('_', ' ')} · {new Date(entry.createdAt).toLocaleString()}{entry.comments ? ` — ${entry.comments}` : ''}</p>)}</div></section></div>}
    {rejecting && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={reject} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><h2 className="font-bold">Reject “{rejecting.name}”</h2><button type="button" onClick={() => setRejecting(null)} aria-label="Close"><X size={18}/></button></div><label className="block text-xs font-semibold">Reason (required)<textarea required minLength={1} maxLength={2000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm"/></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setRejecting(null)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button><button disabled={busyId === rejecting.id || !reason.trim()} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busyId === rejecting.id ? 'Saving…' : 'Reject request'}</button></div></form></div>}
  </div>;
}

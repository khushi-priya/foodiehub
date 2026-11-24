import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, LoaderCircle } from 'lucide-react';
import { api } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

export default function RestaurantNotifications() {
  const { user } = useAuth(); const navigate = useNavigate();
  const membership = useMemo(() => (user?.restaurantMemberships || []).find((entry) => entry.status === 'active'), [user]);
  const [items, setItems] = useState([]); const [unread, setUnread] = useState(0); const [page, setPage] = useState(1); const [pageCount, setPageCount] = useState(1); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!membership?.restaurantId) return;
    setError('');
    try { const response = await api.get('/restaurant/tools/notifications', { params: { restaurantId: membership.restaurantId, limit: 50, page } }); setItems(response.data?.data?.notifications || []); setUnread(Number(response.data?.data?.unreadCount || 0)); setPageCount(Math.max(1, Number(response.data?.data?.pagination?.totalPages || 1))); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Unable to load restaurant notifications.'); }
    finally { setLoading(false); }
  }, [membership, page]);
  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener('foodiehub:restaurant-notification', refresh);
    return () => window.removeEventListener('foodiehub:restaurant-notification', refresh);
  }, [load]);
  async function markAll() {
    setBusy(true); setError('');
    try { await api.post('/restaurant/tools/notifications/read-all', {}, { params: { restaurantId: membership.restaurantId } }); setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))); setUnread(0); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Unable to update notifications.'); }
    finally { setBusy(false); }
  }
  async function open(item) {
    if (!item.readAt) {
      try { await api.patch(`/restaurant/tools/notifications/${item.id}/read`, {}, { params: { restaurantId: membership.restaurantId } }); setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)); setUnread((value) => Math.max(0, value - 1)); }
      catch (requestError) { setError(requestError.response?.data?.message || 'Unable to update this notification.'); return; }
    }
    if (item.href) navigate(item.href);
  }
  return <main className="mx-auto max-w-4xl p-4 sm:p-7"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Restaurant workspace</p><h1 className="mt-2 flex items-center gap-2 text-2xl font-extrabold text-slate-900"><Bell size={24}/>Notifications</h1><p className="mt-2 text-sm text-slate-500">Order, kitchen, reservation, payment and delivery updates for your authorized branches.</p></div><button type="button" onClick={markAll} disabled={!unread || busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 disabled:opacity-50"><CheckCheck size={16}/>{busy ? 'Updating…' : `Mark all read (${unread})`}</button></header>
    {error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin"/>Loading notifications…</div> : !items.length ? <div className="px-6 py-16 text-center"><Bell size={28} className="mx-auto text-slate-300"/><p className="mt-3 font-semibold text-slate-700">No notifications yet</p><p className="mt-1 text-sm text-slate-500">New activity will appear here and stay available after you sign out.</p></div> : <ul className="divide-y divide-slate-100">{items.map((item) => <li key={item.id}><button type="button" onClick={() => open(item)} className={`flex w-full gap-4 p-4 text-left transition hover:bg-slate-50 sm:p-5 ${item.readAt ? 'bg-white' : 'bg-orange-50/50'}`}><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.readAt ? 'bg-slate-200' : 'bg-orange-500'}`}/><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-900">{item.title}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{item.category}</span>{item.readAt && <Check size={14} className="text-emerald-600"/>}</span><span className="mt-1 block text-sm leading-6 text-slate-600">{item.message}</span><span className="mt-2 block text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</span></span></button></li>)}</ul>}{!loading && pageCount > 1 && <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-3"><span className="text-xs text-slate-500">Page {page} of {pageCount}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40">Previous</button><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40">Next</button></div></footer>}</section>
  </main>;
}

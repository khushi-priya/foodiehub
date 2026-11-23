import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, LoaderCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../services/api';

const when = (date) => date ? new Date(date).toLocaleString() : '';
const messageOf = (error) => error.response?.data?.message || 'Notifications could not be loaded.';

export default function CustomerNotifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (targetPage = 1, append = false) => {
    setLoading(true); setError('');
    try {
      const response = await api.get('/customer/notifications', { params: { page: targetPage, limit: 20 } });
      const data = response.data.data;
      setItems((current) => append ? [...current, ...data.notifications] : data.notifications);
      setUnreadCount(data.unreadCount);
      setPagination(data.pagination);
      setPage(targetPage);
    } catch (requestError) { setError(messageOf(requestError)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markRead(notification) {
    if (!notification.readAt) {
      setSaving(true); setError('');
      try {
        await api.patch(`/customer/notifications/${encodeURIComponent(notification.id)}/read`);
        setItems((rows) => rows.map((row) => row.id === notification.id ? { ...row, readAt: new Date().toISOString() } : row));
        setUnreadCount((count) => Math.max(0, count - 1));
        window.dispatchEvent(new Event('foodiehub:notifications-read'));
      } catch (requestError) { setError(messageOf(requestError)); return; }
      finally { setSaving(false); }
    }
    if (notification.href?.startsWith('/customer/')) navigate(notification.href);
  }

  async function markAllRead() {
    setSaving(true); setError('');
    try {
      await api.post('/customer/notifications/read-all');
      const now = new Date().toISOString();
      setItems((rows) => rows.map((row) => ({ ...row, readAt: row.readAt || now })));
      setUnreadCount(0);
      window.dispatchEvent(new Event('foodiehub:notifications-read'));
    } catch (requestError) { setError(messageOf(requestError)); }
    finally { setSaving(false); }
  }

  return <section className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-orange-600">Your account</p><h1 className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl">Notifications</h1><p className="mt-1 text-sm text-slate-500">Order, payment, reservation, delivery and support updates.</p></div><div className="flex gap-2"><button type="button" onClick={() => load(page)} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>Refresh</button>{unreadCount > 0 && <button type="button" onClick={markAllRead} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-50"><CheckCheck size={15}/>Mark all read</button>}</div></header>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Notifications list">
      {loading && !items.length ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle size={17} className="animate-spin"/>Loading notifications</div> : items.length ? <ul className="divide-y divide-slate-100">{items.map((item) => <li key={item.id}><button type="button" onClick={() => markRead(item)} disabled={saving} className="flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-orange-50/60 sm:px-5"><span className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.readAt ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-orange-700'}`}><Bell size={17}/></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-900">{item.title}</span>{!item.readAt && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">NEW</span>}<span className="ml-auto text-[10px] capitalize text-slate-400">{item.category}</span></span><span className="mt-1 block text-sm leading-relaxed text-slate-600">{item.message}</span><time className="mt-1 block text-xs text-slate-400">{when(item.createdAt)}</time></span></button></li>)}</ul> : <div className="px-5 py-14 text-center"><Bell size={30} className="mx-auto text-slate-300"/><p className="mt-3 font-bold text-slate-800">You’re all caught up</p><p className="mt-1 text-sm text-slate-500">New updates will appear here.</p></div>}
      {page < pagination.totalPages && <div className="border-t border-slate-100 p-4 text-center"><button type="button" onClick={() => load(page + 1, true)} disabled={loading} className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50">{loading ? 'Loading…' : 'Load older notifications'}</button></div>}
    </section>
  </section>;
}

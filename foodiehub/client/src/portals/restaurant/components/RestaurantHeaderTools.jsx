import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Check, ChevronRight, LoaderCircle, Search, X } from 'lucide-react';
import { api } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { connectRestaurantNotificationSocket } from '../../../services/socket';

const showTime = (value) => value ? new Date(value).toLocaleString() : '';

export default function RestaurantHeaderTools() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const membership = useMemo(() => (user?.restaurantMemberships || []).find((entry) => entry.status === 'active'), [user]);
  const restaurantId = membership?.restaurantId;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const requestNumber = useRef(0);

  const loadNotifications = useCallback(async () => {
    if (!restaurantId) return;
    setNotificationLoading(true); setNotificationError('');
    try {
      const response = await api.get('/restaurant/tools/notifications', { params: { restaurantId, limit: 8 } });
      setNotifications(response.data?.data?.notifications || []);
      setUnreadCount(Number(response.data?.data?.unreadCount || 0));
    } catch (error) { setNotificationError(error.response?.data?.message || 'Unable to load notifications.'); }
    finally { setNotificationLoading(false); }
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return undefined;
    loadNotifications();
    return connectRestaurantNotificationSocket(() => { loadNotifications(); window.dispatchEvent(new Event('foodiehub:restaurant-notification')); });
  }, [loadNotifications, restaurantId]);
  useEffect(() => {
    if (!restaurantId || query.trim().length < 2) { requestNumber.current += 1; setResults([]); setSearchError(''); setSearchLoading(false); return undefined; }
    const requestId = ++requestNumber.current;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true); setSearchError('');
      try {
        const response = await api.get('/restaurant/tools/search', { params: { restaurantId, q: query.trim() } });
        if (requestId === requestNumber.current) { setResults(response.data?.data?.results || []); setActiveIndex(-1); }
      } catch (error) { if (requestId === requestNumber.current) { setResults([]); setSearchError(error.response?.data?.message || 'Search is unavailable. Try again.'); } }
      finally { if (requestId === requestNumber.current) setSearchLoading(false); }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, restaurantId]);

  useEffect(() => { setSearchOpen(false); setMobileSearchOpen(false); setNotificationOpen(false); }, [location.pathname, location.search]);

  function openResult(item) { setSearchOpen(false); setQuery(''); navigate(item.href); }
  function onSearchKeyDown(event) {
    if (event.key === 'Escape') { setSearchOpen(false); return; }
    if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setSearchOpen(true); setActiveIndex((index) => (index + 1) % results.length); }
    if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setSearchOpen(true); setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1)); }
    if (event.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) { event.preventDefault(); openResult(results[activeIndex]); }
  }

  async function markRead(notification) {
    try { await api.patch(`/restaurant/tools/notifications/${notification.id}/read`, {}, { params: { restaurantId } }); }
    catch (error) { setNotificationError(error.response?.data?.message || 'Unable to update this notification.'); return false; }
    setNotifications((current) => current.map((entry) => entry.id === notification.id ? { ...entry, readAt: entry.readAt || new Date().toISOString() } : entry));
    setUnreadCount((current) => Math.max(0, current - (notification.readAt ? 0 : 1)));
    return true;
  }

  async function openNotification(notification) {
    if (!notification.readAt) await markRead(notification);
    setNotificationOpen(false);
    if (notification.href) navigate(notification.href);
  }

  async function markAllRead() {
    if (!restaurantId || !unreadCount || marking) return;
    setMarking(true); setNotificationError('');
    try {
      await api.post('/restaurant/tools/notifications/read-all', {}, { params: { restaurantId } });
      setNotifications((current) => current.map((entry) => ({ ...entry, readAt: entry.readAt || new Date().toISOString() })));
      setUnreadCount(0);
    } catch (error) { setNotificationError(error.response?.data?.message || 'Unable to mark notifications as read.'); }
    finally { setMarking(false); }
  }

  return <div className="flex items-center gap-2 sm:gap-3">
    <button type="button" onClick={() => { setMobileSearchOpen((value) => !value); setNotificationOpen(false); setSearchOpen(true); }} aria-label="Search restaurant records" className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 md:hidden"><Search size={20}/></button>
    <div className={`relative w-[min(38vw,360px)] ${mobileSearchOpen ? 'absolute right-4 top-[68px] z-40 block w-[min(92vw,400px)]' : 'hidden'} md:relative md:top-auto md:right-auto md:block md:w-[min(38vw,360px)]`}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input value={query} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} onKeyDown={onSearchKeyDown} role="combobox" aria-expanded={searchOpen} aria-controls="restaurant-global-search" aria-autocomplete="list" placeholder="Search orders, customers, menu items..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-xs text-slate-800 outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-100" />
      {query && <button type="button" onClick={() => { setQuery(''); setResults([]); setSearchOpen(false); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-200"><X size={15}/></button>}
      {searchOpen && query.trim().length >= 2 && <div id="restaurant-global-search" role="listbox" className="absolute right-0 top-12 z-50 max-h-[min(70vh,460px)] w-[min(90vw,440px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
        {searchLoading && <p className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin"/> Searching restaurant records…</p>}
        {!searchLoading && searchError && <p role="alert" className="px-3 py-4 text-sm text-rose-700">{searchError}</p>}
        {!searchLoading && !searchError && !results.length && <p className="px-3 py-4 text-sm text-slate-500">No matching orders, customers, menu items or other records.</p>}
        {!searchLoading && results.map((item, index) => <button type="button" role="option" aria-selected={activeIndex === index} key={`${item.type}-${item.entityId}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => openResult(item)} className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left ${activeIndex === index ? 'bg-orange-50' : 'hover:bg-slate-50'}`}><span className="mt-0.5 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{item.type}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{item.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{item.secondary}</span></span><ChevronRight size={16} className="mt-1 shrink-0 text-slate-400"/></button>)}
      </div>}
    </div>
    <div className="relative">
      <button type="button" onClick={() => { setNotificationOpen((value) => !value); setSearchOpen(false); setMobileSearchOpen(false); if (!notificationOpen) loadNotifications(); }} className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={notificationOpen} title="Notifications"><Bell size={20}/>{unreadCount > 0 && <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-orange-500 px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>
      {notificationOpen && <div className="absolute right-0 top-12 z-50 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-bold text-slate-900">Notifications</h2><p className="text-xs text-slate-500">{unreadCount} unread</p></div><button type="button" onClick={markAllRead} disabled={!unreadCount || marking} className="text-xs font-semibold text-orange-600 disabled:opacity-50">{marking ? 'Updating…' : 'Mark all read'}</button></div>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto">{notificationLoading && <p className="flex items-center gap-2 p-5 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin"/> Loading notifications…</p>}{notificationError && <p role="alert" className="px-4 py-3 text-xs text-rose-700">{notificationError}</p>}{!notificationLoading && !notifications.length && <p className="p-7 text-center text-sm text-slate-500">You’re all caught up. New restaurant updates will appear here.</p>}{notifications.map((item) => <button key={item.id} type="button" onClick={() => openNotification(item)} className={`flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${item.readAt ? 'bg-white' : 'bg-orange-50/60'}`}><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.readAt ? 'bg-slate-200' : 'bg-orange-500'}`}/><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-800">{item.title}</span>{item.readAt && <Check size={13} className="shrink-0 text-emerald-600"/>}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{item.message}</span><span className="mt-1 block text-[10px] text-slate-400">{showTime(item.createdAt)}</span></span></button>)}</div>
        <button type="button" onClick={() => { setNotificationOpen(false); navigate('/restaurant/notifications'); }} className="w-full border-t border-slate-100 px-4 py-3 text-center text-xs font-bold text-orange-600 hover:bg-orange-50">View all notifications</button>
      </div>}
    </div>
  </div>;
}

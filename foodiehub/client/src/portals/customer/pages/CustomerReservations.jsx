import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock3, LoaderCircle, Plus, RefreshCw, Users } from 'lucide-react';
import { api } from '../../../services/api';
import { connectCustomerReservationSocket } from '../../../services/socket';
import CustomerReservationForm from '../components/CustomerReservationForm';

const errorText = (error) => error.response?.data?.message || error.message || 'Reservations could not be loaded.';
const statusStyle = { pending: 'bg-amber-50 text-amber-800', confirmed: 'bg-emerald-50 text-emerald-800', checked_in: 'bg-blue-50 text-blue-800', seated: 'bg-indigo-50 text-indigo-800', completed: 'bg-slate-100 text-slate-700', cancelled: 'bg-slate-100 text-slate-600', rejected: 'bg-rose-50 text-rose-700', no_show: 'bg-red-50 text-red-700' };

function dateTime(value, timeZone) {
  try { return new Intl.DateTimeFormat('en-IN', { timeZone: timeZone || 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' }).format(new Date(value)); }
  catch { return 'Reservation time unavailable'; }
}

export default function CustomerReservations() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/customer/reservations');
      setReservations(response.data.data || []);
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => connectCustomerReservationSocket(() => load()), [load]);

  async function cancelReservation(reservation) {
    if (!window.confirm(`Cancel reservation ${reservation.reference}?`)) return;
    setSavingId(reservation.id);
    setError('');
    try {
      await api.patch(`/customer/reservations/${reservation.id}/cancel`);
      setNotice('Reservation cancelled.');
      await load();
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setSavingId(''); }
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">Your bookings</p><h1 className="mt-2 text-3xl font-extrabold text-slate-900">My Reservations</h1><p className="mt-2 text-sm text-slate-500">Track restaurant responses, table assignments and upcoming visits.</p></div>
        <div className="flex gap-2"><button type="button" onClick={load} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>Refresh</button><button type="button" onClick={() => { setError(''); setNotice(''); setShowForm(true); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white"><Plus size={16}/>Book a Table</button></div>
      </header>
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}<button type="button" onClick={load} className="font-bold underline">Retry</button></div>}
      {loading ? <div className="flex min-h-48 items-center justify-center"><LoaderCircle className="animate-spin text-orange-500"/></div> : reservations.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{reservations.map((reservation) => {
        const canCancel = ['pending', 'confirmed'].includes(reservation.status);
        return <article key={reservation.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reservation reference</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">{reservation.reference}</h2></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusStyle[reservation.status] || 'bg-slate-100 text-slate-600'}`}>{reservation.status.replaceAll('_', ' ')}</span></div>
          <p className="mt-3 font-semibold text-slate-800">{reservation.restaurant?.name || 'Restaurant'}</p><p className="text-sm text-slate-500">{reservation.branch?.name || 'Branch'}{reservation.branch?.city ? ` · ${reservation.branch.city}` : ''}</p>
          <div className="mt-4 space-y-2 border-y border-slate-100 py-3 text-sm text-slate-600"><p className="flex items-start gap-2"><CalendarDays size={15} className="mt-0.5 shrink-0 text-orange-500"/>{dateTime(reservation.startsAt, reservation.branch?.timeZone)}</p><p className="flex items-center gap-2"><Users size={15} className="text-orange-500"/>{reservation.partySize} guests · {reservation.durationMinutes} minutes</p><p className="flex items-center gap-2"><Clock3 size={15} className="text-orange-500"/>{reservation.table?.tableNumber ? `Table ${reservation.table.tableNumber}` : 'Table assigned when confirmed'}</p></div>
          {reservation.status === 'rejected' && reservation.rejectionReason && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">Reason: {reservation.rejectionReason}</p>}
          {reservation.notes && <p className="mt-3 line-clamp-3 text-xs text-slate-500">Notes: {reservation.notes}</p>}
          {canCancel && <button type="button" disabled={savingId === reservation.id} onClick={() => cancelReservation(reservation)} className="mt-4 min-h-10 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">{savingId === reservation.id ? 'Cancelling…' : 'Cancel reservation'}</button>}
        </article>;
      })}</div> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><CalendarDays className="mx-auto text-slate-300"/><h2 className="mt-3 font-bold text-slate-800">No reservations yet</h2><p className="mt-1 text-sm text-slate-500">Book a table at any eligible restaurant without scanning a QR code.</p><button type="button" onClick={() => setShowForm(true)} className="mt-5 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white">Book a Table</button></section>}
      {showForm && <CustomerReservationForm onClose={() => setShowForm(false)} onCreated={(reservation) => { setShowForm(false); setNotice(`Request ${reservation.reference} sent. The restaurant will review it shortly.`); load(); }} />}
    </main>
  );
}

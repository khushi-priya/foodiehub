import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  Check,
  Clock3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Users,
  X,
  User,
  MapPin,
  Search,
  FileText,
} from 'lucide-react';
import { api } from '../../../services/api';
import { connectFloorSocket } from '../../../services/socket';

const errorText = (error) =>
  error.response?.data?.message || error.message || 'Unable to load reservations.';

const statuses = [
  'upcoming',
  'all',
  'pending',
  'confirmed',
  'checked_in',
  'seated',
  'completed',
  'cancelled',
  'rejected',
  'no_show',
];

const transitions = {
  pending: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['seated', 'cancelled', 'no_show'],
  seated: ['completed'],
};

const initialForm = {
  guestName: '',
  guestPhone: '',
  guestEmail: '',
  branchId: '',
  partySize: 2,
  startsAt: '',
  durationMinutes: 120,
  notes: '',
};

const isValidIndianMobile = (phone) => /^[6-9]\d{9}$/.test(phone);

function branchLocalDateTime(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  } catch {
    return '';
  }
}

function formatReservationDateTime(value, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone: timeZone || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return 'Invalid reservation time';
  }
}

function formatReservationTime(value, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone: timeZone || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '—';
  }
}

const inputClass =
  'mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100';

const labelClass = 'block text-xs font-semibold text-slate-600';

export default function RestaurantReservations() {
  const [branches, setBranches] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  const [form, setForm] = useState(initialForm);
  const [reservationNow, setReservationNow] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [tableChoices, setTableChoices] = useState({});
  const [selectedTables, setSelectedTables] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [reservationResult, branchResult] = await Promise.all([
        api.get('/restaurant/floor/reservations', {
          params: { status: filter, ...(search.trim() ? { search: search.trim() } : {}) },
        }),
        api.get('/restaurant/floor/branches'),
      ]);

      setReservations(reservationResult.data.data || []);
      setBranches(branchResult.data.data || []);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => connectFloorSocket(() => load()), [load]);

  useEffect(() => {
    if (!showForm) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape' && !saving) {
        setShowForm(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => window.removeEventListener('keydown', handleEscape);
  }, [showForm, saving]);

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setForm(initialForm);
    setPhoneError('');
  }

  function handlePhoneChange(value) {
    const digits = value.replace(/\D/g, '').slice(0, 10);

    setForm((previous) => ({
      ...previous,
      guestPhone: digits,
    }));

    if (!digits) {
      setPhoneError('');
    } else if (digits.length < 10) {
      setPhoneError('Enter a complete 10-digit mobile number.');
    } else if (!isValidIndianMobile(digits)) {
      setPhoneError('Enter a valid Indian mobile number starting with 6–9.');
    } else {
      setPhoneError('');
    }
  }

  async function createReservation(event) {
    event.preventDefault();
    setError('');
    setPhoneError('');

    if (!isValidIndianMobile(form.guestPhone)) {
      setPhoneError('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(form.startsAt)) {
      setError('Please select a valid reservation date and time.');
      return;
    }

    setSaving(true);

    try {
      await api.post('/restaurant/floor/reservations', {
        ...form,
        guestName: form.guestName.trim(),
        guestPhone: form.guestPhone,
        guestEmail: form.guestEmail.trim(),
        notes: form.notes.trim(),
        partySize: Number(form.partySize),
        durationMinutes: Number(form.durationMinutes),
        // datetime-local is a wall time in the selected branch's IANA zone.
        // The server resolves it in that zone; do not convert through browser time.
        startsAt: form.startsAt,
      });

      setNotice('Reservation created successfully. Confirm it to hold the assigned table.');
      setForm(initialForm);
      setPhoneError('');
      setShowForm(false);
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function loadTableChoices(reservation) {
    setBusyId(reservation.id);
    setError('');
    try {
      const response = await api.get(`/restaurant/floor/reservations/${reservation.id}/tables`);
      const choices = response.data.data || [];
      setTableChoices((current) => ({ ...current, [reservation.id]: choices }));
      setSelectedTables((current) => ({ ...current, [reservation.id]: choices[0]?.id || '' }));
      if (!choices.length) setError('No suitable available table can accommodate this reservation.');
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setBusyId(''); }
  }

  async function updateStatus(reservation, status, extra = {}) {
    setBusyId(reservation.id);
    setError('');

    try {
      let payload = { status, ...extra };
      if (status === 'rejected' && reservation.customerId) {
        const reason = window.prompt('Optional rejection reason:');
        if (reason === null) return;
        payload.rejectionReason = reason.trim() || null;
      }
      await api.patch(
        `/restaurant/floor/reservations/${reservation.id}/status`,
        payload
      );

      setNotice(`Reservation ${status.replaceAll('_', ' ')}.`);
      setTableChoices((current) => { const next = { ...current }; delete next[reservation.id]; return next; });
      await load();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusyId('');
    }
  }

  const availableBranches = branches.filter(
    (branch) => branch.isActive && branch.approvalStatus === 'approved' &&
      branch.dineInEnabled && !['inactive', 'temporarily_closed'].includes(branch.operationalStatus)
  );
  const selectedBranch = availableBranches.find((branch) => branch.id === form.branchId);
  const selectedTimeZone = selectedBranch?.timeZone || 'Asia/Kolkata';
  const minReservationTime = reservationNow ? branchLocalDateTime(reservationNow, selectedTimeZone) : '';

  return (
    <main className="mx-auto w-full max-w-[1400px] space-y-5 pb-8">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
            Floor operations
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
            Reservations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Assign tables, prevent overlapping bookings and follow guests through seating.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-[220px] flex-1 sm:flex-none"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input aria-label="Search reservations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reservations..." className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-orange-400"/></label>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => {
              setForm(initialForm);
              setReservationNow(Date.now());
              setPhoneError('');
              setError('');
              setShowForm(true);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600"
          >
            <Plus size={16} />
            Walk-in / phone booking
          </button>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
          <button
            type="button"
            onClick={() => setNotice('')}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && !showForm && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}

      {/* New Reservation Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-[3px] sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservation-modal-title"
            className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-orange-600">
                  Floor operations
                </p>
                <h2
                  id="reservation-modal-title"
                  className="mt-1 text-xl font-bold text-slate-900"
                >
                  Walk-in / phone booking
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Use this separate form for a guest booking made in person or by phone.
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                aria-label="Close reservation form"
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={createReservation}>
              <div className="max-h-[calc(100vh-190px)] space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                  >
                    {error}
                  </div>
                )}

                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                    <User size={16} className="text-orange-500" />
                    Guest information
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className={labelClass}>
                      Guest name *
                      <input
                        required
                        maxLength={150}
                        value={form.guestName}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            guestName: event.target.value,
                          }))
                        }
                        placeholder="Enter guest name"
                        className={inputClass}
                      />
                    </label>

                    <label className={labelClass}>
                      Mobile number *
                      <div className="relative mt-1.5">
                        <span className="absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-slate-500">
                          +91
                        </span>
                        <input
                          required
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          maxLength={10}
                          pattern="[6-9][0-9]{9}"
                          value={form.guestPhone}
                          onChange={(event) => handlePhoneChange(event.target.value)}
                          placeholder="9876543210"
                          aria-invalid={Boolean(phoneError)}
                          aria-describedby="reservation-phone-help"
                          className={`${inputClass} pl-12 ${
                            phoneError
                              ? 'border-red-400 focus:border-red-400 focus:ring-red-100'
                              : ''
                          }`}
                        />
                      </div>
                      <span
                        id="reservation-phone-help"
                        className={`mt-1.5 block text-[11px] font-medium ${
                          phoneError ? 'text-red-600' : 'text-slate-400'
                        }`}
                      >
                        {phoneError || 'Enter a valid 10-digit Indian mobile number.'}
                      </span>
                    </label>

                    <label className={`${labelClass} sm:col-span-2`}>
                      Email address (optional)
                      <input
                        type="email"
                        maxLength={254}
                        value={form.guestEmail}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            guestEmail: event.target.value,
                          }))
                        }
                        placeholder="guest@example.com"
                        className={inputClass}
                      />
                    </label>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                    <CalendarDays size={16} className="text-orange-500" />
                    Reservation details
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className={labelClass}>
                      Branch *
                      <div className="relative">
                        <MapPin
                          size={16}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <select
                          required
                          value={form.branchId}
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              branchId: event.target.value,
                            }))
                          }
                          className={`${inputClass} pl-9`}
                        >
                          <option value="">Choose branch</option>
                          {availableBranches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {availableBranches.length === 0 && (
                        <span className="mt-1 block text-[11px] text-amber-600">
                          No active, approved branches available.
                        </span>
                      )}
                    </label>

                    <label className={labelClass}>
                      Date and time *
                      <input
                        required
                        type="datetime-local"
                        min={minReservationTime || undefined}
                        value={form.startsAt}
                        onChange={(event) =>
                          setForm((previous) => ({
                            ...previous,
                            startsAt: event.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                      <span className="mt-1 block text-[11px] text-slate-400">
                        Enter branch local time ({selectedTimeZone}).
                      </span>
                    </label>

                    <label className={labelClass}>
                      Number of guests *
                      <div className="relative">
                        <Users
                          size={16}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          required
                          type="number"
                          min="1"
                          max="100"
                          value={form.partySize}
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              partySize: event.target.value,
                            }))
                          }
                          className={`${inputClass} pl-9`}
                        />
                      </div>
                    </label>

                    <label className={labelClass}>
                      Duration *
                      <div className="relative">
                        <Clock3
                          size={16}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <select
                          required
                          value={form.durationMinutes}
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              durationMinutes: event.target.value,
                            }))
                          }
                          className={`${inputClass} pl-9`}
                        >
                          <option value={60}>1 hour</option>
                          <option value={90}>1 hour 30 minutes</option>
                          <option value={120}>2 hours</option>
                          <option value={150}>2 hours 30 minutes</option>
                          <option value={180}>3 hours</option>
                          <option value={240}>4 hours</option>
                          <option value={300}>5 hours</option>
                          <option value={360}>6 hours</option>
                        </select>
                      </div>
                    </label>

                    <label className={`${labelClass} sm:col-span-2`}>
                      Special requests / Notes
                      <div className="relative">
                        <FileText
                          size={16}
                          className="absolute left-3 top-3.5 text-slate-400"
                        />
                        <textarea
                          maxLength={2000}
                          rows={3}
                          value={form.notes}
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              notes: event.target.value,
                            }))
                          }
                          placeholder="Birthday celebration, preferred seating, special requests..."
                          className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                        />
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving || Boolean(phoneError) || availableBranches.length === 0}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}
                  {saving ? 'Creating reservation...' : 'Create reservation'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Reservation Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {statuses.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold capitalize ${
              filter === status
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600'
            }`}
          >
            {status.replaceAll('_', ' ')}
          </button>
        ))}
      </div>

      {/* Reservation List */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-48 animate-pulse rounded-2xl bg-slate-100"
            />
          ))}
        </div>
      ) : reservations.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {reservations.map((reservation) => (
            <article
              key={reservation.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">
                    {reservation.guestName}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {reservation.guestPhone}
                  </p>
                </div>

                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold capitalize text-slate-600">
                  {reservation.status.replaceAll('_', ' ')}
                </span>
              </div>

              <div className="mt-4 space-y-2 border-y border-slate-100 py-3 text-sm text-slate-600">
                <p className="flex items-center gap-2">
                  <CalendarDays size={15} />
                  {formatReservationDateTime(reservation.startsAt, reservation.branch?.timeZone)}
                </p>

                <p className="flex items-center gap-2">
                  <Users size={15} />
                  {reservation.partySize} guests · Table{' '}
                  {reservation.table?.tableNumber || 'Not assigned'}
                </p>

                <p className="flex items-center gap-2">
                  <Clock3 size={15} />
                  {reservation.branch?.name || 'Branch'} · until{' '}
                  {formatReservationTime(reservation.endsAt, reservation.branch?.timeZone)}
                </p>
              </div>

              {reservation.guestEmail && <p className="mt-2 break-all text-xs text-slate-500">{reservation.guestEmail}</p>}
              {reservation.notes && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{reservation.notes}</p>}
              {reservation.status === 'pending' && reservation.customerId && !reservation.tableId && tableChoices[reservation.id] && (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                  <label className="block text-xs font-semibold text-slate-600">Available table
                    <select value={selectedTables[reservation.id] || ''} onChange={(event) => setSelectedTables((current) => ({ ...current, [reservation.id]: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" disabled={!tableChoices[reservation.id].length}>
                      {tableChoices[reservation.id].map((table) => <option key={table.id} value={table.id}>Table {table.tableNumber} · {table.seatingCapacity} seats</option>)}
                      {!tableChoices[reservation.id].length && <option value="">No available tables</option>}
                    </select>
                  </label>
                  <button type="button" disabled={busyId === reservation.id || !selectedTables[reservation.id]} onClick={() => updateStatus(reservation, 'confirmed', { tableId: selectedTables[reservation.id] })} className="mt-2 min-h-9 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-50">{busyId === reservation.id ? 'Saving…' : 'Confirm with table'}</button>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {(transitions[reservation.status] || []).map((status) => (
                  status === 'confirmed' && reservation.customerId && !reservation.tableId ? (
                    <button key={status} type="button" disabled={busyId === reservation.id} onClick={() => loadTableChoices(reservation)} className="min-h-9 rounded-lg bg-indigo-50 px-3 text-xs font-bold text-indigo-700 disabled:opacity-50">{busyId === reservation.id ? 'Loading…' : 'Choose table'}</button>
                  ) : <button
                    key={status}
                    type="button"
                    disabled={busyId === reservation.id}
                    onClick={() => updateStatus(reservation, status)}
                    className={`min-h-9 rounded-lg px-3 text-xs font-bold capitalize disabled:opacity-50 ${
                      ['rejected', 'cancelled', 'no_show'].includes(status)
                        ? 'bg-red-50 text-red-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {busyId === reservation.id
                      ? 'Saving...'
                      : status.replaceAll('_', ' ')}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
          <CalendarDays className="mx-auto text-slate-300" />
          <h2 className="mt-3 font-bold text-slate-800">
            No {filter === 'all' ? '' : `${filter.replaceAll('_', ' ')} `}reservations
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Customer online requests appear here. Walk-in and phone bookings can be added separately.
          </p>
        </div>
      )}
    </main>
  );
}

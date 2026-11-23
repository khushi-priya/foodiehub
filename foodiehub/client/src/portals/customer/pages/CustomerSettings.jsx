import { useEffect, useState } from 'react';
import { BellRing, LoaderCircle, Save } from 'lucide-react';
import { api } from '../../../services/api';

const fields = [
  ['orderUpdates', 'Order updates', 'Restaurant accepted, prepared, or completed your order.'],
  ['paymentUpdates', 'Payment and refund updates', 'Payment verification, failure, and refund changes.'],
  ['reservationUpdates', 'Reservation updates', 'Confirmation, rejection, and changes from the restaurant.'],
  ['deliveryUpdates', 'Delivery updates', 'Assignment and delivery progress.'],
  ['supportUpdates', 'Support updates', 'Replies and status changes on your support tickets.'],
  ['marketingUpdates', 'Offers and promotions', 'Optional promotional messages in your FoodieHub account.'],
];
const messageOf = (error) => error.response?.data?.message || 'Settings could not be saved.';

export default function CustomerSettings() {
  const [preferences, setPreferences] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    api.get('/customer/notification-preferences').then(({ data }) => {
      if (active) { setPreferences(data.data); setSaved(data.data); }
    }).catch((requestError) => { if (active) setError(messageOf(requestError)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const dirty = preferences && fields.some(([key]) => preferences[key] !== saved?.[key]);
  async function save(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const payload = Object.fromEntries(fields.filter(([key]) => preferences[key] !== saved?.[key]).map(([key]) => [key, preferences[key]]));
      const { data } = await api.patch('/customer/notification-preferences', payload);
      setPreferences(data.data); setSaved(data.data); setNotice('Notification preferences saved.');
    } catch (requestError) { setError(messageOf(requestError)); }
    finally { setSaving(false); }
  }
  return <section className="mx-auto max-w-3xl space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-[.14em] text-orange-600">Your account</p><h1 className="mt-1 text-2xl font-extrabold text-slate-950 sm:text-3xl">Settings</h1><p className="mt-1 text-sm text-slate-500">Choose which in-app updates you want to receive.</p></header>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={17}/>Loading settings</div> : preferences && <form onSubmit={save} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center gap-3 border-b border-slate-100 p-4 sm:p-5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><BellRing size={19}/></span><div><h2 className="font-bold text-slate-900">In-app notifications</h2><p className="text-xs text-slate-500">Operational updates are enabled by default. Promotional updates are optional.</p></div></div><div className="divide-y divide-slate-100">{fields.map(([key, label, help]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-4 p-4 sm:px-5"><span><span className="block text-sm font-semibold text-slate-800">{label}</span><span className="mt-0.5 block text-xs text-slate-500">{help}</span></span><input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))} className="h-5 w-5 shrink-0 accent-orange-500"/></label>)}</div><div className="flex justify-end border-t border-slate-100 p-4"><button type="submit" disabled={saving || !dirty} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle className="animate-spin" size={15}/> : <Save size={15}/>}Save preferences</button></div></form>}
  </section>;
}
